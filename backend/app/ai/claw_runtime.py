"""
NexLab Claw-Code Autonomous Harness Runtime (`backend/app/ai/claw_runtime.py`).

Clean-room adaptation of the Claw-Code (`claw-code-main`) harness architecture
engineered specifically for the NexLab multi-tenant virtual lab platform:
- `QueryEngineConfig` & `TurnResult`: Multi-turn autonomous tool chaining (`max_turns=6`)
  with token budget tracking and structured JSON output retries.
- `ToolPermissionContext` & `PermissionDenial`: Auto-executes creation, setup, authoring,
  scheduling, grading, and workspace tools immediately; only gates destructive operations
  (deletions, force-logouts, tenant suspension) behind confirmation cards.
- `CommandGraph`: Built-in slash commands (`/setup`, `/experiment`, `/exam`, `/schedule`,
  `/autograde`, `/collection`, `/playground`, `/studyplan`, `/report`, `/onboard`) mapped
  to role-scoped autonomous workflows.
- `ToolPool` & `ExecutionRegistry`: Scores and routes prompts across all 5 roles
  (`institution_admin`, `instructor`, `student`, `free_user`, `admin`).
- `TranscriptStore`: Manages turn history and rolling compaction.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Any

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# 1. Core Dataclasses (Mirrored from claw-code-main/src/models.py & query_engine.py)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class UsageSummary:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

    def add(self, usage_dict: dict | None) -> 'UsageSummary':
        if not usage_dict:
            return self
        inp = int(usage_dict.get('prompt_tokens') or usage_dict.get('input_tokens') or 0)
        out = int(usage_dict.get('completion_tokens') or usage_dict.get('output_tokens') or 0)
        tot = int(usage_dict.get('total_tokens') or (inp + out))
        return UsageSummary(
            input_tokens=self.input_tokens + inp,
            output_tokens=self.output_tokens + out,
            total_tokens=self.total_tokens + tot,
        )


@dataclass(frozen=True)
class PermissionDenial:
    tool_name: str
    reason: str
    pending_action: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class HarnessToolSpec:
    name: str
    fn: Callable[..., Any]
    description: str
    roles: tuple[str, ...]
    category: str = 'general'
    is_destructive: bool = False  # Only True for destructive ops (delete, force_logout, suspend)


@dataclass(frozen=True)
class SlashCommandSpec:
    name: str               # e.g. '/experiment'
    role_scope: tuple[str, ...]
    target_tool: str
    description: str
    prompt_template: str


@dataclass(frozen=True)
class QueryEngineConfig:
    max_turns: int = 6
    max_budget_tokens: int = 12000
    compact_after_turns: int = 16
    structured_retry_limit: int = 2


@dataclass
class TranscriptStore:
    entries: list[dict[str, str]] = field(default_factory=list)
    flushed: bool = False

    def append(self, role: str, content: str) -> None:
        self.entries.append({'role': role, 'content': content})
        self.flushed = False

    def compact(self, keep_last: int = 10) -> None:
        if len(self.entries) > keep_last:
            self.entries[:] = self.entries[-keep_last:]

    def flush(self) -> None:
        self.flushed = True


@dataclass(frozen=True)
class TurnResult:
    prompt: str
    output: str
    matched_commands: tuple[str, ...]
    executed_tools: tuple[dict[str, Any], ...]
    permission_denials: tuple[PermissionDenial, ...]
    usage: UsageSummary
    stop_reason: str
    generated_doc: dict[str, Any] | None = None
    socratic_filtered: bool = False
    sources: tuple[dict[str, Any], ...] = ()


# ══════════════════════════════════════════════════════════════════════════════
# 2. ToolPermissionContext (Auto-Execute vs. Destructive Confirmation Gate)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ToolPermissionContext:
    """
    Controls which tools execute autonomously inside the multi-step QueryEngine loop
    vs. which tools are blocked or require explicit confirmation.
    - Students & Free Users: strictly blocked from staff/admin mutation tools.
    - Instructors, Institution Admins & Platform Admins: ALL creation, setup, authoring,
      enrollment, scheduling, grading, and report tools AUTO-EXECUTE immediately!
      Only destructive tools (`is_destructive=True` or in `gate_prefixes`) pause for confirmation.
    """
    role: str
    deny_names: frozenset[str] = field(default_factory=frozenset)
    gate_prefixes: tuple[str, ...] = ('delete_', 'destroy_', 'force_logout', 'suspend_', 'terminate_')

    def is_allowed_for_role(self, spec: HarnessToolSpec) -> bool:
        return self.role in spec.roles or 'all' in spec.roles

    def requires_confirmation_gate(self, spec: HarnessToolSpec) -> bool:
        if spec.is_destructive:
            return True
        lowered = spec.name.lower()
        if lowered in self.deny_names:
            return True
        return any(lowered.startswith(prefix) for prefix in self.gate_prefixes)


# ══════════════════════════════════════════════════════════════════════════════
# 3. CommandGraph (Slash Commands for Rapid Autonomous Workflows)
# ══════════════════════════════════════════════════════════════════════════════

SLASH_COMMANDS: tuple[SlashCommandSpec, ...] = (
    SlashCommandSpec(
        name='/setup',
        role_scope=('institution_admin',),
        target_tool='autonomous_campus_setup',
        description='End-to-end setup of Academic Year, Department, Batch, Sections, Subjects, Instructor assignment, Student enrollment & Recurring Timetable',
        prompt_template='Execute autonomous_campus_setup for: {args}',
    ),
    SlashCommandSpec(
        name='/schedule',
        role_scope=('institution_admin', 'instructor'),
        target_tool='autonomous_schedule_sessions',
        description='Create a RecurringPlan or schedule conflict-checked LabSessions automatically',
        prompt_template='Schedule lab sessions automatically for: {args}',
    ),
    SlashCommandSpec(
        name='/experiment',
        role_scope=('instructor', 'institution_admin'),
        target_tool='build_complete_experiment_suite',
        description='Create a complete Experiment with ContentPages, HTML interactive simulation, Markdown theory, runnable code, Quiz, Viva, TestCases & SPARK Checkpoints',
        prompt_template='Build and publish a complete experiment suite for: {args}',
    ),
    SlashCommandSpec(
        name='/exam',
        role_scope=('instructor', 'institution_admin'),
        target_tool='build_complete_exam',
        description='Create and publish a timed Exam with AI-generated MCQ and Coding questions',
        prompt_template='Create a complete timed exam with questions for: {args}',
    ),
    SlashCommandSpec(
        name='/autograde',
        role_scope=('instructor', 'institution_admin'),
        target_tool='autonomous_bulk_autograde',
        description='Auto-grade all student submissions for an experiment and compute final grades',
        prompt_template='Run autonomous bulk auto-grading for: {args}',
    ),
    SlashCommandSpec(
        name='/collection',
        role_scope=('student', 'free_user'),
        target_tool='build_personal_problem_collection',
        description='Create a custom Practice Problem Collection playlist in your account targeted at a topic or skill gap',
        prompt_template='Build a personal practice problem collection in my account for: {args}',
    ),
    SlashCommandSpec(
        name='/playground',
        role_scope=('student', 'free_user'),
        target_tool='create_saved_playground_workspace',
        description='Create a saved Playground coding session pre-loaded with a starter template and sample stdin',
        prompt_template='Create a saved playground coding workspace in my account for: {args}',
    ),
    SlashCommandSpec(
        name='/studyplan',
        role_scope=('student', 'free_user'),
        target_tool='enroll_and_build_study_plan',
        description='Enroll in a Study Plan and generate a personalized multi-day roadmap',
        prompt_template='Enroll me and generate a study plan for: {args}',
    ),
    SlashCommandSpec(
        name='/report',
        role_scope=('institution_admin', 'instructor', 'admin'),
        target_tool='generate_executive_report',
        description='Generate a downloadable CSV, XLSX, or Markdown analytics/accreditation report',
        prompt_template='Generate a downloadable report for: {args}',
    ),
    SlashCommandSpec(
        name='/onboard',
        role_scope=('admin',),
        target_tool='autonomous_onboard_institution',
        description='Provision a new Institution tenant, admin account, academic year, AI policy, and Free Course/Contest setup',
        prompt_template='Onboard institution tenant: {args}',
    ),
)


def match_slash_command(prompt: str, role: str) -> tuple[SlashCommandSpec | None, str]:
    """
    Checks if the user prompt starts with a registered `/command`.
    Returns (SlashCommandSpec, rewritten_prompt).
    """
    text = (prompt or '').strip()
    if not text.startswith('/'):
        return None, text

    parts = text.split(maxsplit=1)
    cmd_token = parts[0].lower()
    rest = parts[1] if len(parts) > 1 else ''

    for spec in SLASH_COMMANDS:
        if spec.name == cmd_token and role in spec.role_scope:
            rewritten = spec.prompt_template.format(args=rest or 'default')
            return spec, rewritten
    return None, text


# ══════════════════════════════════════════════════════════════════════════════
# 4. ExecutionRegistry & ToolPool (Scoring & Routing)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class ExecutionRegistry:
    tools_by_name: dict[str, HarnessToolSpec] = field(default_factory=dict)

    def register(self, spec: HarnessToolSpec) -> None:
        self.tools_by_name[spec.name] = spec

    def get(self, name: str) -> HarnessToolSpec | None:
        if name in self.tools_by_name:
            return self.tools_by_name[name]
        lowered = (name or '').lower()
        for k, spec in self.tools_by_name.items():
            if k.lower() == lowered:
                return spec
        return None

    def route_tools_for_turn(
        self,
        role: str,
        prompt: str,
        page_context: dict | None = None,
        limit: int = 18,
    ) -> list[HarnessToolSpec]:
        """
        Scores all tools available to `role` against the prompt and active UI route,
        returning the top `limit` tools for the system prompt catalog while keeping
        every registered role tool executable by name.
        """
        perm = ToolPermissionContext(role=role)
        allowed = [spec for spec in self.tools_by_name.values() if perm.is_allowed_for_role(spec)]

        tokens = set(re.findall(r'[a-z0-9_]+', (prompt or '').lower()))
        route_str = ((page_context or {}).get('route') or '').lower()
        route_tokens = set(re.findall(r'[a-z0-9_]+', route_str))
        all_tokens = tokens | route_tokens

        scored: list[tuple[int, str, HarnessToolSpec]] = []
        for spec in allowed:
            haystack = f"{spec.name} {spec.category} {spec.description}".lower()
            h_tokens = set(re.findall(r'[a-z0-9_]+', haystack))
            score = len(all_tokens & h_tokens) * 2
            if any(v in tokens for v in ('create', 'build', 'setup', 'add', 'enroll', 'assign', 'schedule', 'generate', 'make', 'auto', 'publish', 'html', 'simulation', 'quiz', 'exam')):
                if any(p in spec.name for p in ('autonomous_', 'build_', 'create_', 'assign_', 'schedule_', 'enroll_', 'generate_')):
                    score += 6
            scored.append((score, spec.name, spec))

        scored.sort(key=lambda item: (-item[0], item[1]))
        return [item[2] for item in scored[:limit]]
