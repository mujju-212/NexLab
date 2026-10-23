-- =============================================================================
-- NexLab Virtual Lab Platform — Complete PostgreSQL Database Schema
-- Database: virtuallab (PostgreSQL 15+)
-- Contains all 99 tables, constraints, foreign keys, and performance indexes.
-- =============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 15.18 (Debian 15.18-1.pgdg13+1)
-- Dumped by pg_dump version 15.18 (Debian 15.18-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: academic_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_years (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    year_label character varying(20) NOT NULL,
    is_active boolean,
    created_at timestamp without time zone
);


--
-- Name: admin_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_chat_messages (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    mode character varying(20) DEFAULT 'chat'::character varying,
    tool_calls json,
    pending_action json,
    sources json,
    total_tokens integer DEFAULT 0,
    created_at timestamp without time zone,
    generated_doc json,
    socratic_filtered boolean DEFAULT false
);


--
-- Name: admin_chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_chat_sessions (
    id character varying(36) NOT NULL,
    institution_id character varying(36),
    user_id character varying(36) NOT NULL,
    title character varying(255) DEFAULT 'New Conversation'::character varying,
    mode character varying(20) DEFAULT 'chat'::character varying,
    is_pinned boolean DEFAULT false,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    role_scope character varying(30) DEFAULT 'institution_admin'::character varying,
    compact_memory text,
    page_context json
);


--
-- Name: ai_agent_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_run (
    id character varying(36) NOT NULL,
    institution_id character varying(36),
    user_id character varying(36),
    prompt text,
    tool_calls text,
    result text,
    total_tokens integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: ai_feature_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_feature_configs (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    feature_id character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    category character varying(50),
    description text,
    enabled boolean DEFAULT true NOT NULL,
    available_roles text,
    default_model character varying(80),
    rate_limit_per_hour integer,
    cost_per_1k double precision,
    supported_content character varying(100),
    enabled_since character varying(30),
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: ai_generated_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_generated_documents (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    institution_id character varying(36),
    conversation_id character varying(36),
    title character varying(255) NOT NULL,
    format character varying(16) NOT NULL,
    file_path character varying(512),
    content_text text,
    file_size_bytes integer,
    created_at timestamp without time zone,
    expires_at timestamp without time zone
);


--
-- Name: ai_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_policy (
    institution_id character varying(36) NOT NULL,
    ai_enabled_global boolean DEFAULT true NOT NULL,
    ai_enabled_students boolean DEFAULT true NOT NULL,
    ai_enabled_instructors boolean DEFAULT true NOT NULL,
    features_enabled text,
    daily_token_quota integer,
    monthly_token_quota integer,
    per_student_daily_quota integer,
    hard_stop boolean DEFAULT true NOT NULL,
    updated_by character varying(36),
    updated_at timestamp without time zone
);


--
-- Name: ai_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_log (
    id character varying(36) NOT NULL,
    institution_id character varying(36),
    user_id character varying(36),
    role character varying(30),
    feature character varying(40) NOT NULL,
    model character varying(80),
    provider character varying(20) DEFAULT 'groq'::character varying,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost_usd double precision,
    latency_ms integer,
    success boolean DEFAULT true NOT NULL,
    section_subject_id character varying(36),
    created_at timestamp without time zone NOT NULL
);


--
-- Name: ai_user_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_user_quotas (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    monthly_token_quota integer DEFAULT 1000000 NOT NULL,
    current_month_tokens integer DEFAULT 0 NOT NULL,
    reset_date character varying(30),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: analytics_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_config (
    institution_id character varying(36) NOT NULL,
    risk_weights json NOT NULL,
    risk_bands json NOT NULL,
    mastery_halflife_days integer,
    min_sample_size integer,
    updated_at timestamp without time zone
);


--
-- Name: announcement_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_interactions (
    id character varying(36) NOT NULL,
    announcement_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    read_at timestamp without time zone,
    liked boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    author_id character varying(36) NOT NULL,
    author_role character varying(30) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    priority character varying(20) NOT NULL,
    category character varying(30) NOT NULL,
    target character varying(30) NOT NULL,
    department_id character varying(36),
    academic_year integer,
    batch_id character varying(36),
    section_id character varying(36),
    section_subject_id character varying(36),
    attachment_name character varying(255),
    attachment_url text,
    attachment_size character varying(50),
    status character varying(20) NOT NULL,
    send_at timestamp without time zone,
    sent_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    reach_count integer DEFAULT 0 NOT NULL,
    views_count integer DEFAULT 0 NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    actor_id character varying(36) NOT NULL,
    action character varying(50) NOT NULL,
    target_type character varying(30),
    target_id character varying(36),
    detail text,
    created_at timestamp without time zone,
    module character varying(50),
    ip_address character varying(45),
    severity character varying(20) DEFAULT 'low'::character varying NOT NULL
);


--
-- Name: batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batches (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    year_id character varying(36) NOT NULL,
    name text NOT NULL,
    program character varying(100),
    created_at timestamp without time zone,
    department_id character varying(36)
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    from_id character varying(36) NOT NULL,
    to_id character varying(36),
    text text NOT NULL,
    at timestamp without time zone DEFAULT now()
);


--
-- Name: checkpoint_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_progress (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    checkpoint_id character varying(36) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    passed_at timestamp without time zone,
    attempts integer DEFAULT 0,
    last_signal_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoints (
    id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    title text NOT NULL,
    description text,
    test_case_ids json,
    weight integer DEFAULT 10,
    is_gated boolean DEFAULT false,
    page_id character varying(36),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: code_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_attempts (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    session_id character varying(36),
    attempt_number integer NOT NULL,
    language character varying(10) NOT NULL,
    files json NOT NULL,
    stdin text,
    compile_status character varying(20),
    compile_output text,
    stdout text,
    stderr text,
    test_cases_passed integer,
    test_cases_total integer,
    execution_time_ms integer,
    memory_used_kb integer,
    loc integer,
    cyclomatic_complexity double precision,
    quality_grade character varying(2),
    is_final_submission boolean,
    is_catchup boolean,
    submitted_at timestamp without time zone
);


--
-- Name: code_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_versions (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    session_id character varying(36),
    version_number integer NOT NULL,
    files json NOT NULL,
    is_full_snapshot boolean,
    diff_from_prev text,
    saved_at timestamp without time zone,
    save_type character varying(15)
);


--
-- Name: coding_contests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coding_contests (
    id character varying(36) NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    starts_at timestamp without time zone NOT NULL,
    ends_at timestamp without time zone NOT NULL,
    problem_ids json,
    created_by character varying(36),
    created_at timestamp without time zone
);


--
-- Name: collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_items (
    id character varying(36) NOT NULL,
    collection_id character varying(36) NOT NULL,
    problem_id character varying(36) NOT NULL,
    order_index integer
);


--
-- Name: compliance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_settings (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    security_score integer,
    compliance_status character varying(30),
    last_assessed character varying(30),
    frameworks_json text,
    retention_json text,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: concept_mastery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concept_mastery (
    student_id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    concept text NOT NULL,
    mastery_score double precision,
    experiment_count integer,
    last_updated timestamp without time zone
);


--
-- Name: concept_prereqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concept_prereqs (
    id character varying(36) NOT NULL,
    concept character varying(100) NOT NULL,
    requires_concept character varying(100) NOT NULL,
    subject_id character varying(36),
    created_at timestamp without time zone
);


--
-- Name: content_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_modules (
    id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    module_type character varying(10) NOT NULL,
    title text NOT NULL,
    content_data json,
    display_order integer NOT NULL,
    min_watch_pct integer,
    page_id character varying(36)
);


--
-- Name: content_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_pages (
    id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    title text NOT NULL,
    display_order integer NOT NULL,
    created_at timestamp without time zone,
    release_at timestamp without time zone,
    is_live boolean DEFAULT false NOT NULL
);


--
-- Name: content_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_progress (
    student_id character varying(36) NOT NULL,
    module_id character varying(36) NOT NULL,
    completed boolean,
    score double precision,
    attempts integer,
    watch_pct double precision,
    last_attempt_at timestamp without time zone,
    completed_at timestamp without time zone,
    answers json
);


--
-- Name: contest_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contest_participants (
    id character varying(36) NOT NULL,
    contest_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    joined_at timestamp without time zone,
    solved_slugs json,
    score integer
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    name text NOT NULL,
    code character varying(20),
    created_at timestamp without time zone,
    description text,
    color character varying(30) DEFAULT '#7c3aed'::character varying,
    is_active boolean DEFAULT true
);


--
-- Name: email_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_otps (
    id character varying(36) NOT NULL,
    email text NOT NULL,
    purpose character varying(30) NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0,
    verified boolean DEFAULT false,
    verified_at timestamp without time zone,
    created_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: environment_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.environment_profiles (
    id character varying(36) NOT NULL,
    institution_id character varying(36),
    name text NOT NULL,
    display_name text NOT NULL,
    docker_image text NOT NULL,
    is_platform_default boolean,
    pip_packages json,
    apt_packages json,
    build_status character varying(20),
    created_by character varying(36),
    approved_by character varying(36),
    created_at timestamp without time zone
);


--
-- Name: exam_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_attempts (
    id character varying(36) NOT NULL,
    exam_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    started_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    submitted_at timestamp without time zone,
    score double precision DEFAULT '0'::double precision,
    total_points double precision DEFAULT '0'::double precision,
    max_points double precision DEFAULT '0'::double precision,
    passed boolean DEFAULT false,
    status character varying(20) DEFAULT 'in_progress'::character varying,
    answers json,
    created_at timestamp without time zone DEFAULT now(),
    experiment_id character varying(36)
);


--
-- Name: exam_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_questions (
    id character varying(36) NOT NULL,
    exam_id character varying(36) NOT NULL,
    question_type character varying(10) DEFAULT 'mcq'::character varying,
    prompt text NOT NULL,
    points double precision DEFAULT '1'::double precision,
    display_order integer DEFAULT 0,
    explanation text,
    options json,
    correct_answer character varying(10),
    language character varying(30),
    starter_code text,
    test_cases json,
    created_at timestamp without time zone DEFAULT now(),
    experiment_id character varying(36)
);


--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    subject_id character varying(36) NOT NULL,
    created_by character varying(36),
    title text NOT NULL,
    description text,
    exam_type character varying(10) DEFAULT 'mcq'::character varying,
    available_from timestamp without time zone,
    due_at timestamp without time zone,
    duration_minutes integer DEFAULT 30,
    max_attempts integer DEFAULT 1,
    pass_threshold integer DEFAULT 40,
    shuffle_questions boolean DEFAULT true,
    is_published boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    grade_weight double precision DEFAULT '0'::double precision
);


--
-- Name: experiment_concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experiment_concepts (
    id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    concept character varying(100) NOT NULL,
    weight double precision,
    created_at timestamp without time zone
);


--
-- Name: experiments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experiments (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    subject_id character varying(36) NOT NULL,
    instructor_id character varying(36) NOT NULL,
    exp_number integer NOT NULL,
    title text NOT NULL,
    aim text,
    theory text,
    problem_statement text,
    input_format text,
    output_format text,
    difficulty_level integer,
    concept_tags json,
    allowed_languages json,
    is_multi_file boolean,
    file_structure json,
    rubric_test_cases integer,
    rubric_lab_report integer,
    rubric_code_quality integer,
    rubric_viva integer,
    enable_viva boolean,
    enable_lockdown boolean,
    time_limit_sec integer,
    memory_limit_kb integer,
    is_published boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    allow_ai_hints boolean DEFAULT true,
    simulation_entry text,
    simulation_files text,
    weightage integer DEFAULT 1 NOT NULL,
    grade_scale integer DEFAULT 100 NOT NULL,
    experiment_type character varying(20) DEFAULT 'coding'::character varying,
    rubric_quiz integer DEFAULT 0,
    proctor_defaults json,
    ranking_visible boolean DEFAULT true,
    published_content json,
    content_dirty boolean,
    content_published_at timestamp without time zone,
    delivery_mode character varying(10) DEFAULT 'lab'::character varying,
    available_from timestamp without time zone,
    due_at timestamp without time zone,
    max_attempts integer DEFAULT 1,
    pass_threshold integer DEFAULT 40,
    shuffle_questions boolean DEFAULT false
);


--
-- Name: extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extensions (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    granted_by character varying(36) NOT NULL,
    reason text,
    extension_until timestamp without time zone NOT NULL,
    excused boolean DEFAULT false,
    created_at timestamp without time zone
);


--
-- Name: faq_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faq_articles (
    id character varying(36) NOT NULL,
    category character varying(50) NOT NULL,
    category_title character varying(100) NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    helpful_count integer DEFAULT 0,
    unhelpful_count integer DEFAULT 0,
    is_published boolean DEFAULT true,
    "order" integer DEFAULT 0,
    tags text,
    created_at timestamp without time zone
);


--
-- Name: focus_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.focus_scores (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    tab_switches integer,
    window_blurs integer,
    idle_seconds integer,
    copy_paste_count integer,
    face_present_pct double precision,
    gaze_score double precision,
    large_paste_detected boolean,
    typing_speed_avg double precision,
    focus_score double precision,
    recorded_at timestamp without time zone,
    signals json
);


--
-- Name: free_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.free_courses (
    id character varying(36) NOT NULL,
    slug character varying(80) NOT NULL,
    title text NOT NULL,
    description text,
    thumbnail_url text,
    difficulty character varying(20) DEFAULT 'beginner'::character varying,
    tags json,
    language character varying(20) DEFAULT 'python'::character varying,
    is_published boolean DEFAULT false,
    order_index integer DEFAULT 0,
    created_at timestamp without time zone
);


--
-- Name: free_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.free_exercises (
    id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    order_index integer DEFAULT 0,
    title text NOT NULL,
    description text,
    hint_text text,
    difficulty character varying(20) DEFAULT 'easy'::character varying,
    starter_code json,
    allowed_languages json,
    test_cases json,
    time_limit_sec integer DEFAULT 5,
    memory_limit_kb integer DEFAULT 131072,
    exercise_type character varying(10) DEFAULT 'coding'::character varying,
    mcq_options json,
    mcq_answer character varying(2),
    mcq_explanation text,
    xp_reward integer DEFAULT 10,
    is_published boolean DEFAULT true,
    created_at timestamp without time zone,
    simulation_path text,
    tags jsonb,
    acceptance_rate real,
    solves_count integer
);


--
-- Name: free_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.free_progress (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    exercise_id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    status character varying(10) DEFAULT 'attempted'::character varying,
    attempts integer DEFAULT 0,
    best_score double precision DEFAULT '0'::double precision,
    last_code text,
    language_used character varying(20),
    xp_earned integer DEFAULT 0,
    solved_at timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    session_id character varying(36),
    auto_grade double precision,
    manual_grade double precision,
    manual_feedback text,
    viva_grade double precision,
    hint_deduction double precision,
    final_grade double precision,
    code_quality_grade double precision,
    graded_by character varying(36),
    graded_at timestamp without time zone,
    is_locked boolean,
    created_at timestamp without time zone,
    quiz_grade double precision
);


--
-- Name: groq_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groq_usage (
    institution_id character varying(36) NOT NULL,
    usage_date date NOT NULL,
    count integer DEFAULT 0
);


--
-- Name: hint_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hint_logs (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    session_id character varying(36),
    hint_level integer NOT NULL,
    prompt_sent text,
    response_received text,
    model_used character varying(50),
    latency_ms integer,
    is_fallback boolean,
    created_at timestamp without time zone
);


--
-- Name: inline_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inline_comments (
    id character varying(36) NOT NULL,
    grade_id character varying(36) NOT NULL,
    file_name character varying(100),
    line_number integer NOT NULL,
    comment text NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: institution_daily_kpis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_daily_kpis (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    snapshot_date date NOT NULL,
    kpis json NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: institution_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_documents (
    id character varying(36) NOT NULL,
    institution_id character varying(36),
    uploaded_by character varying(36) NOT NULL,
    filename character varying(255) NOT NULL,
    file_path character varying(512) NOT NULL,
    file_size integer DEFAULT 0,
    page_count integer DEFAULT 0,
    chunks json,
    status character varying(20) DEFAULT 'indexed'::character varying,
    created_at timestamp without time zone,
    scope_type character varying(30) DEFAULT 'institution'::character varying,
    scope_id character varying(36),
    doc_type character varying(20) DEFAULT 'pdf'::character varying
);


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id character varying(36) NOT NULL,
    name text NOT NULL,
    code character varying(20) NOT NULL,
    email_domain text,
    logo_url text,
    address text,
    contact_email text,
    plan character varying(20),
    is_active boolean,
    onboarded_at timestamp without time zone,
    plan_updated_at timestamp without time zone,
    groq_limit_override integer,
    billing_notes text,
    billing_email text,
    onboarding_status character varying(30) DEFAULT 'pending'::character varying,
    onboarding_completed_at timestamp without time zone,
    has_users boolean DEFAULT false,
    has_experiments boolean DEFAULT false,
    has_environment boolean DEFAULT false,
    institution_type character varying(30),
    phone character varying(20),
    website text,
    notification_prefs text,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
    auto_renewal boolean DEFAULT true,
    next_billing_date character varying(30) DEFAULT '10 Oct 2026'::character varying,
    billing_contact_person character varying(100) DEFAULT 'Institution Admin'::character varying
);


--
-- Name: instructor_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_settings (
    instructor_id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    default_proctor_policy json,
    default_rubric json,
    default_session_duration_min integer DEFAULT 90,
    default_late_join_window_min integer DEFAULT 10,
    default_gate_threshold integer DEFAULT 70,
    allow_ai_hints boolean DEFAULT true,
    at_risk_avg_threshold integer DEFAULT 40,
    at_risk_min_threshold integer DEFAULT 20,
    notification_prefs json,
    updated_at timestamp without time zone
);


--
-- Name: interventions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interventions (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    created_by character varying(36) NOT NULL,
    action_type character varying(30) NOT NULL,
    note text,
    follow_up_at timestamp without time zone,
    outcome character varying(20) DEFAULT 'open'::character varying,
    outcome_note text,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone,
    risk_score_before double precision,
    risk_score_after double precision,
    updated_at timestamp without time zone,
    notes text
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    invoice_number character varying(50) NOT NULL,
    amount double precision NOT NULL,
    currency character varying(10) DEFAULT 'INR'::character varying,
    plan character varying(50),
    billing_date timestamp without time zone,
    status character varying(20) DEFAULT 'paid'::character varying,
    payment_method character varying(50),
    items_json text,
    created_at timestamp without time zone
);


--
-- Name: lab_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_sessions (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    section_subject_id character varying(36) NOT NULL,
    experiment_id character varying(36),
    scheduled_at timestamp without time zone NOT NULL,
    duration_minutes integer NOT NULL,
    gate_score_threshold integer,
    late_join_window_min integer,
    catchup_enabled boolean,
    catchup_deadline timestamp without time zone,
    focus_ml_enabled boolean,
    lockdown_enabled boolean,
    status character varying(20),
    jitsi_room_name text,
    started_at timestamp without time zone,
    ended_at timestamp without time zone,
    created_at timestamp without time zone,
    title text,
    current_mode character varying(20) DEFAULT 'briefing'::character varying,
    live_page_state_id character varying(36)
);


--
-- Name: live_page_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_page_states (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    current_page_id character varying(36),
    launched_page_ids json,
    page_timer_ends_at timestamp without time zone,
    launched_quiz_module_id character varying(36),
    updated_by character varying(36),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    type character varying(30),
    title text,
    message text,
    is_read boolean,
    created_at timestamp without time zone
);


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    card_brand character varying(30),
    last4 character varying(4) NOT NULL,
    exp_month integer NOT NULL,
    exp_year integer NOT NULL,
    cardholder_name character varying(100),
    is_default boolean DEFAULT false,
    created_at timestamp without time zone
);


--
-- Name: plagiarism_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plagiarism_flags (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    session_id character varying(36),
    student_a_id character varying(36) NOT NULL,
    student_b_id character varying(36) NOT NULL,
    similarity_pct double precision NOT NULL,
    detected_at timestamp without time zone,
    reviewed_by character varying(36),
    reviewed_at timestamp without time zone,
    status character varying(20),
    review_notes text
);


--
-- Name: platform_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_config (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamp without time zone,
    updated_by character varying(36)
);


--
-- Name: platform_rating_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_rating_periods (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    period_type character varying(20) NOT NULL,
    period_key character varying(20) NOT NULL,
    rating double precision,
    rank_pos integer,
    created_at timestamp without time zone
);


--
-- Name: platform_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_ratings (
    student_id character varying(36) NOT NULL,
    rating double precision NOT NULL,
    global_rank integer,
    global_percentile double precision,
    problems_solved integer,
    easy_solved integer,
    medium_solved integer,
    hard_solved integer,
    streak_days integer,
    updated_at timestamp without time zone
);


--
-- Name: playground_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playground_sessions (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    title character varying(200),
    language character varying(30) NOT NULL,
    code text NOT NULL,
    stdin_data text,
    share_slug character varying(20),
    is_shared boolean DEFAULT false,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: practice_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_bookmarks (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    problem_id character varying(36) NOT NULL,
    note text,
    created_at timestamp without time zone
);


--
-- Name: practice_plan_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_plan_progress (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    plan_id character varying(36) NOT NULL,
    solved_slugs json,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    badge_awarded boolean,
    certificate_path character varying(500)
);


--
-- Name: practice_plan_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_plan_sections (
    id character varying(36) NOT NULL,
    plan_id character varying(36) NOT NULL,
    title character varying(120) NOT NULL,
    order_index integer,
    problem_ids json
);


--
-- Name: practice_problems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_problems (
    id character varying(36) NOT NULL,
    slug character varying(120) NOT NULL,
    lc_id character varying(10),
    title character varying(300) NOT NULL,
    difficulty character varying(10) NOT NULL,
    nexlab_topic character varying(60) NOT NULL,
    topics json,
    description text,
    examples json,
    constraints json,
    hints json,
    starter_code json,
    acceptance double precision,
    source character varying(30),
    is_active boolean,
    is_daily boolean,
    daily_date date,
    created_at timestamp without time zone
);


--
-- Name: practice_quest_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_quest_claims (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    quest_key character varying(100) NOT NULL,
    quest_type character varying(30),
    xp_awarded integer,
    claimed_at timestamp without time zone
);


--
-- Name: practice_student_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_student_badges (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    badge_id character varying(30) NOT NULL,
    earned_at timestamp without time zone
);


--
-- Name: practice_student_xp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_student_xp (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    total_xp integer,
    level integer,
    level_name character varying(30),
    streak_days integer,
    streak_last_date date,
    freeze_used_month integer,
    problems_solved integer,
    easy_solved integer,
    medium_solved integer,
    hard_solved integer,
    profile_public boolean DEFAULT false,
    profile_slug character varying(40)
);


--
-- Name: practice_study_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_study_plans (
    id character varying(36) NOT NULL,
    slug character varying(80) NOT NULL,
    title character varying(120) NOT NULL,
    description text,
    icon character varying(10),
    total_problems integer,
    difficulty_mix character varying(60),
    estimated_days integer,
    is_premium boolean,
    badge_id character varying(30),
    order_index integer,
    created_at timestamp without time zone
);


--
-- Name: practice_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_submissions (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    problem_id character varying(36) NOT NULL,
    language character varying(20) NOT NULL,
    code text NOT NULL,
    status character varying(20) NOT NULL,
    passed integer,
    total integer,
    time_ms integer,
    memory_kb integer,
    xp_earned integer,
    is_run boolean,
    submitted_at timestamp without time zone
);


--
-- Name: practice_test_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_test_cases (
    id character varying(36) NOT NULL,
    problem_id character varying(36) NOT NULL,
    input_data text NOT NULL,
    expected text NOT NULL,
    is_sample boolean,
    order_index integer
);


--
-- Name: problem_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.problem_collections (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    created_at timestamp without time zone
);


--
-- Name: proctor_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proctor_events (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    event_type character varying(40) NOT NULL,
    payload json,
    severity character varying(10),
    recorded_at timestamp without time zone NOT NULL
);


--
-- Name: proctor_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proctor_policies (
    id character varying(36) NOT NULL,
    experiment_id character varying(36),
    session_id character varying(36),
    page_id character varying(36),
    lockdown_fullscreen boolean DEFAULT true,
    block_copy_paste boolean DEFAULT true,
    block_tab_switch boolean DEFAULT true,
    plagiarism_scan boolean DEFAULT true,
    focus_ml boolean DEFAULT false,
    webcam_required boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone
);


--
-- Name: question_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_bank (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    created_by character varying(36) NOT NULL,
    question_text text NOT NULL,
    options json,
    correct_answer character varying(5),
    explanation text,
    tags json,
    created_at timestamp without time zone
);


--
-- Name: quiz_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_questions (
    id character varying(36) NOT NULL,
    module_id character varying(36) NOT NULL,
    question_text text NOT NULL,
    options json,
    correct_answer character varying(5),
    points integer,
    explanation text
);


--
-- Name: rank_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rank_snapshots (
    id character varying(36) NOT NULL,
    institution_id character varying(36),
    student_id character varying(36) NOT NULL,
    scope_level character varying(30) NOT NULL,
    scope_id character varying(36),
    period character varying(20) NOT NULL,
    mastery_score double precision,
    engagement_score double precision,
    effort_score double precision,
    efficiency_score double precision,
    consistency_score double precision,
    rank_score double precision NOT NULL,
    rank_position integer NOT NULL,
    cohort_size integer NOT NULL,
    percentile double precision NOT NULL,
    computed_at timestamp without time zone
);


--
-- Name: recurring_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_plans (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    name text NOT NULL,
    description text,
    department_id character varying(36),
    batch_id character varying(36),
    academic_year_id character varying(36),
    sections_json text,
    subjects_json text,
    schedule_days_json text,
    start_time character varying(20),
    duration_minutes integer,
    start_date date NOT NULL,
    end_date date NOT NULL,
    room character varying(100),
    instructor_id character varying(36),
    status character varying(20),
    sessions_generated_count integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    created_by character varying(36) NOT NULL,
    kind character varying(40) NOT NULL,
    params json,
    status character varying(20) DEFAULT 'pending'::character varying,
    file_path text,
    error text,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone
);


--
-- Name: scheduled_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_announcements (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    created_by character varying(36) NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    target character varying(20) DEFAULT 'all'::character varying NOT NULL,
    department_id character varying(36),
    batch_id character varying(36),
    section_id character varying(36),
    academic_year integer,
    send_at timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    sent_at timestamp without time zone,
    recipients_sent integer,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: section_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_students (
    section_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    enrolled_at timestamp without time zone
);


--
-- Name: section_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_subjects (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    section_id character varying(36) NOT NULL,
    subject_id character varying(36) NOT NULL,
    instructor_id character varying(36) NOT NULL,
    co_instructor_id character varying(36),
    created_at timestamp without time zone
);


--
-- Name: sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sections (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    batch_id character varying(36) NOT NULL,
    name character varying(10) NOT NULL,
    created_at timestamp without time zone,
    class_teacher_id character varying(36),
    section_code character varying(20),
    max_students integer DEFAULT 60,
    is_active boolean DEFAULT true
);


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_events (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    user_id character varying(36),
    user_name character varying(120),
    event_type character varying(50) NOT NULL,
    title character varying(150) NOT NULL,
    ip_address character varying(45),
    location character varying(100),
    severity character varying(20),
    details text,
    created_at timestamp without time zone
);


--
-- Name: session_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_attendance (
    session_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    joined_at timestamp without time zone,
    left_at timestamp without time zone,
    reconnect_count integer,
    total_time_seconds integer,
    is_catchup boolean,
    status character varying(25),
    is_active_participant boolean,
    override_reason text,
    override_by character varying(36),
    feedback_submitted boolean DEFAULT false
);


--
-- Name: session_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_feedback (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    experiment_clarity integer,
    session_pacing integer,
    ai_hint_helpfulness integer,
    overall_rating integer,
    comment text,
    submitted_at timestamp without time zone
);


--
-- Name: session_feedback_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_feedback_receipts (
    session_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    submitted_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: session_mode_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_mode_transitions (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    from_mode character varying(20),
    to_mode character varying(20) NOT NULL,
    actor_id character varying(36),
    reason text,
    at timestamp without time zone DEFAULT now()
);


--
-- Name: session_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_polls (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    created_by character varying(36) NOT NULL,
    question text NOT NULL,
    options json,
    responses json,
    is_open boolean DEFAULT true,
    created_at timestamp without time zone
);


--
-- Name: student_metric_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_metric_snapshots (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    section_subject_id character varying(36),
    snapshot_date date NOT NULL,
    metrics json NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: student_rankings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_rankings (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    section_subject_id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    mastery_score double precision,
    engagement_score double precision,
    effort_score double precision,
    efficiency_score double precision,
    consistency_score double precision,
    rank_score double precision,
    rank_position integer,
    updated_at timestamp without time zone
);


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    name text NOT NULL,
    code character varying(20),
    description text,
    env_profile_id character varying(36),
    created_at timestamp without time zone,
    total_marks integer DEFAULT 100 NOT NULL,
    icon character varying(50) DEFAULT 'datastruct'::character varying,
    color character varying(30) DEFAULT '#7c3aed'::character varying,
    department_id character varying(36),
    subject_type character varying(50) DEFAULT 'Theory'::character varying,
    is_active boolean DEFAULT true
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id character varying(36) NOT NULL,
    ticket_number character varying(50) NOT NULL,
    institution_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    subject character varying(255) NOT NULL,
    category character varying(50),
    priority character varying(20),
    message text NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: teacher_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_notes (
    id character varying(36) NOT NULL,
    institution_id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    created_by character varying(36) NOT NULL,
    note text NOT NULL,
    created_at timestamp without time zone
);


--
-- Name: test_case_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_case_results (
    id character varying(36) NOT NULL,
    attempt_id character varying(36) NOT NULL,
    test_case_id character varying(36) NOT NULL,
    passed boolean NOT NULL,
    execution_time_ms integer,
    output text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: test_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_cases (
    id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    input_data text,
    expected_output text,
    is_hidden boolean,
    points_weight double precision,
    description text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying(36) NOT NULL,
    institution_id character varying(36),
    email text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    role character varying(30) NOT NULL,
    roll_number character varying(30),
    phone character varying(15),
    profile_pic_url text,
    is_active boolean,
    created_at timestamp without time zone,
    last_login timestamp without time zone,
    force_logout_at timestamp without time zone,
    first_name text,
    last_name text,
    staff_id character varying(30),
    department_id character varying(36),
    year_of_study integer,
    semester integer,
    must_change_password boolean DEFAULT false NOT NULL,
    location character varying(100) DEFAULT 'Bengaluru, Karnataka'::character varying,
    bio text DEFAULT 'Empowering education through technology.'::text,
    timezone character varying(50) DEFAULT '(GMT+05:30) Asia/Kolkata'::character varying,
    language character varying(50) DEFAULT 'English (India)'::character varying,
    two_factor_enabled boolean DEFAULT false
);


--
-- Name: viva_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viva_answers (
    id character varying(36) NOT NULL,
    viva_session_id character varying(36) NOT NULL,
    question_index integer NOT NULL,
    question_text text,
    answer_text text,
    score double precision,
    ai_feedback text,
    submitted_at timestamp without time zone
);


--
-- Name: viva_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viva_sessions (
    id character varying(36) NOT NULL,
    student_id character varying(36) NOT NULL,
    experiment_id character varying(36) NOT NULL,
    grade_id character varying(36),
    questions json,
    total_score double precision,
    status character varying(20),
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone
);


--
-- Name: academic_years academic_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_years
    ADD CONSTRAINT academic_years_pkey PRIMARY KEY (id);


--
-- Name: admin_chat_messages admin_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_chat_messages
    ADD CONSTRAINT admin_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: admin_chat_sessions admin_chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_chat_sessions
    ADD CONSTRAINT admin_chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_run ai_agent_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_run
    ADD CONSTRAINT ai_agent_run_pkey PRIMARY KEY (id);


--
-- Name: ai_feature_configs ai_feature_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feature_configs
    ADD CONSTRAINT ai_feature_configs_pkey PRIMARY KEY (id);


--
-- Name: ai_generated_documents ai_generated_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_generated_documents
    ADD CONSTRAINT ai_generated_documents_pkey PRIMARY KEY (id);


--
-- Name: ai_policy ai_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_policy
    ADD CONSTRAINT ai_policy_pkey PRIMARY KEY (institution_id);


--
-- Name: ai_usage_log ai_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_log
    ADD CONSTRAINT ai_usage_log_pkey PRIMARY KEY (id);


--
-- Name: ai_user_quotas ai_user_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_user_quotas
    ADD CONSTRAINT ai_user_quotas_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: analytics_config analytics_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_config
    ADD CONSTRAINT analytics_config_pkey PRIMARY KEY (institution_id);


--
-- Name: announcement_interactions announcement_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_interactions
    ADD CONSTRAINT announcement_interactions_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: checkpoint_progress checkpoint_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_progress
    ADD CONSTRAINT checkpoint_progress_pkey PRIMARY KEY (id);


--
-- Name: checkpoints checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (id);


--
-- Name: code_attempts code_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_attempts
    ADD CONSTRAINT code_attempts_pkey PRIMARY KEY (id);


--
-- Name: code_versions code_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_versions
    ADD CONSTRAINT code_versions_pkey PRIMARY KEY (id);


--
-- Name: coding_contests coding_contests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coding_contests
    ADD CONSTRAINT coding_contests_pkey PRIMARY KEY (id);


--
-- Name: collection_items collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_pkey PRIMARY KEY (id);


--
-- Name: compliance_settings compliance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_settings
    ADD CONSTRAINT compliance_settings_pkey PRIMARY KEY (id);


--
-- Name: concept_mastery concept_mastery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_pkey PRIMARY KEY (student_id, concept);


--
-- Name: concept_prereqs concept_prereqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_prereqs
    ADD CONSTRAINT concept_prereqs_pkey PRIMARY KEY (id);


--
-- Name: content_modules content_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_modules
    ADD CONSTRAINT content_modules_pkey PRIMARY KEY (id);


--
-- Name: content_pages content_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_pkey PRIMARY KEY (id);


--
-- Name: content_progress content_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_progress
    ADD CONSTRAINT content_progress_pkey PRIMARY KEY (student_id, module_id);


--
-- Name: contest_participants contest_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_participants
    ADD CONSTRAINT contest_participants_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: email_otps email_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_otps
    ADD CONSTRAINT email_otps_pkey PRIMARY KEY (id);


--
-- Name: environment_profiles environment_profiles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.environment_profiles
    ADD CONSTRAINT environment_profiles_name_key UNIQUE (name);


--
-- Name: environment_profiles environment_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.environment_profiles
    ADD CONSTRAINT environment_profiles_pkey PRIMARY KEY (id);


--
-- Name: exam_attempts exam_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_attempts
    ADD CONSTRAINT exam_attempts_pkey PRIMARY KEY (id);


--
-- Name: exam_questions exam_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_questions
    ADD CONSTRAINT exam_questions_pkey PRIMARY KEY (id);


--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- Name: experiment_concepts experiment_concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiment_concepts
    ADD CONSTRAINT experiment_concepts_pkey PRIMARY KEY (id);


--
-- Name: experiments experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);


--
-- Name: extensions extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);


--
-- Name: faq_articles faq_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq_articles
    ADD CONSTRAINT faq_articles_pkey PRIMARY KEY (id);


--
-- Name: focus_scores focus_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.focus_scores
    ADD CONSTRAINT focus_scores_pkey PRIMARY KEY (id);


--
-- Name: free_courses free_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_courses
    ADD CONSTRAINT free_courses_pkey PRIMARY KEY (id);


--
-- Name: free_courses free_courses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_courses
    ADD CONSTRAINT free_courses_slug_key UNIQUE (slug);


--
-- Name: free_exercises free_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_exercises
    ADD CONSTRAINT free_exercises_pkey PRIMARY KEY (id);


--
-- Name: free_progress free_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_progress
    ADD CONSTRAINT free_progress_pkey PRIMARY KEY (id);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (id);


--
-- Name: groq_usage groq_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groq_usage
    ADD CONSTRAINT groq_usage_pkey PRIMARY KEY (institution_id, usage_date);


--
-- Name: hint_logs hint_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hint_logs
    ADD CONSTRAINT hint_logs_pkey PRIMARY KEY (id);


--
-- Name: inline_comments inline_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inline_comments
    ADD CONSTRAINT inline_comments_pkey PRIMARY KEY (id);


--
-- Name: institution_daily_kpis institution_daily_kpis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_daily_kpis
    ADD CONSTRAINT institution_daily_kpis_pkey PRIMARY KEY (id);


--
-- Name: institution_documents institution_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_documents
    ADD CONSTRAINT institution_documents_pkey PRIMARY KEY (id);


--
-- Name: institutions institutions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_code_key UNIQUE (code);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: instructor_settings instructor_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_settings
    ADD CONSTRAINT instructor_settings_pkey PRIMARY KEY (instructor_id);


--
-- Name: interventions interventions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions
    ADD CONSTRAINT interventions_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: lab_sessions lab_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_sessions
    ADD CONSTRAINT lab_sessions_pkey PRIMARY KEY (id);


--
-- Name: live_page_states live_page_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_page_states
    ADD CONSTRAINT live_page_states_pkey PRIMARY KEY (id);


--
-- Name: live_page_states live_page_states_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_page_states
    ADD CONSTRAINT live_page_states_session_id_key UNIQUE (session_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: plagiarism_flags plagiarism_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plagiarism_flags
    ADD CONSTRAINT plagiarism_flags_pkey PRIMARY KEY (id);


--
-- Name: platform_config platform_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_config
    ADD CONSTRAINT platform_config_pkey PRIMARY KEY (key);


--
-- Name: platform_rating_periods platform_rating_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_rating_periods
    ADD CONSTRAINT platform_rating_periods_pkey PRIMARY KEY (id);


--
-- Name: platform_ratings platform_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ratings
    ADD CONSTRAINT platform_ratings_pkey PRIMARY KEY (student_id);


--
-- Name: playground_sessions playground_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playground_sessions
    ADD CONSTRAINT playground_sessions_pkey PRIMARY KEY (id);


--
-- Name: playground_sessions playground_sessions_share_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playground_sessions
    ADD CONSTRAINT playground_sessions_share_slug_key UNIQUE (share_slug);


--
-- Name: practice_bookmarks practice_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_bookmarks
    ADD CONSTRAINT practice_bookmarks_pkey PRIMARY KEY (id);


--
-- Name: practice_plan_progress practice_plan_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_plan_progress
    ADD CONSTRAINT practice_plan_progress_pkey PRIMARY KEY (id);


--
-- Name: practice_plan_sections practice_plan_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_plan_sections
    ADD CONSTRAINT practice_plan_sections_pkey PRIMARY KEY (id);


--
-- Name: practice_problems practice_problems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_problems
    ADD CONSTRAINT practice_problems_pkey PRIMARY KEY (id);


--
-- Name: practice_quest_claims practice_quest_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_quest_claims
    ADD CONSTRAINT practice_quest_claims_pkey PRIMARY KEY (id);


--
-- Name: practice_student_badges practice_student_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_student_badges
    ADD CONSTRAINT practice_student_badges_pkey PRIMARY KEY (id);


--
-- Name: practice_student_xp practice_student_xp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_student_xp
    ADD CONSTRAINT practice_student_xp_pkey PRIMARY KEY (id);


--
-- Name: practice_study_plans practice_study_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_study_plans
    ADD CONSTRAINT practice_study_plans_pkey PRIMARY KEY (id);


--
-- Name: practice_study_plans practice_study_plans_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_study_plans
    ADD CONSTRAINT practice_study_plans_slug_key UNIQUE (slug);


--
-- Name: practice_submissions practice_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_submissions
    ADD CONSTRAINT practice_submissions_pkey PRIMARY KEY (id);


--
-- Name: practice_test_cases practice_test_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_test_cases
    ADD CONSTRAINT practice_test_cases_pkey PRIMARY KEY (id);


--
-- Name: problem_collections problem_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.problem_collections
    ADD CONSTRAINT problem_collections_pkey PRIMARY KEY (id);


--
-- Name: proctor_events proctor_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proctor_events
    ADD CONSTRAINT proctor_events_pkey PRIMARY KEY (id);


--
-- Name: proctor_policies proctor_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proctor_policies
    ADD CONSTRAINT proctor_policies_pkey PRIMARY KEY (id);


--
-- Name: question_bank question_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_pkey PRIMARY KEY (id);


--
-- Name: quiz_questions quiz_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_pkey PRIMARY KEY (id);


--
-- Name: rank_snapshots rank_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rank_snapshots
    ADD CONSTRAINT rank_snapshots_pkey PRIMARY KEY (id);


--
-- Name: recurring_plans recurring_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_plans
    ADD CONSTRAINT recurring_plans_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: scheduled_announcements scheduled_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_announcements
    ADD CONSTRAINT scheduled_announcements_pkey PRIMARY KEY (id);


--
-- Name: section_students section_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_students
    ADD CONSTRAINT section_students_pkey PRIMARY KEY (section_id, student_id);


--
-- Name: section_subjects section_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_subjects
    ADD CONSTRAINT section_subjects_pkey PRIMARY KEY (id);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: session_attendance session_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_pkey PRIMARY KEY (session_id, student_id);


--
-- Name: session_feedback session_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_pkey PRIMARY KEY (id);


--
-- Name: session_feedback_receipts session_feedback_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback_receipts
    ADD CONSTRAINT session_feedback_receipts_pkey PRIMARY KEY (session_id, student_id);


--
-- Name: session_mode_transitions session_mode_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_mode_transitions
    ADD CONSTRAINT session_mode_transitions_pkey PRIMARY KEY (id);


--
-- Name: session_polls session_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_polls
    ADD CONSTRAINT session_polls_pkey PRIMARY KEY (id);


--
-- Name: student_metric_snapshots student_metric_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_metric_snapshots
    ADD CONSTRAINT student_metric_snapshots_pkey PRIMARY KEY (id);


--
-- Name: student_rankings student_rankings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_rankings
    ADD CONSTRAINT student_rankings_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: teacher_notes teacher_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notes
    ADD CONSTRAINT teacher_notes_pkey PRIMARY KEY (id);


--
-- Name: test_case_results test_case_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_case_results
    ADD CONSTRAINT test_case_results_pkey PRIMARY KEY (id);


--
-- Name: test_cases test_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_pkey PRIMARY KEY (id);


--
-- Name: announcement_interactions uq_announcement_user_interaction; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_interactions
    ADD CONSTRAINT uq_announcement_user_interaction UNIQUE (announcement_id, user_id);


--
-- Name: collection_items uq_collection_item; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT uq_collection_item UNIQUE (collection_id, problem_id);


--
-- Name: concept_prereqs uq_concept_prereq_sub; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_prereqs
    ADD CONSTRAINT uq_concept_prereq_sub UNIQUE (concept, requires_concept, subject_id);


--
-- Name: contest_participants uq_contest_participant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_participants
    ADD CONSTRAINT uq_contest_participant UNIQUE (contest_id, user_id);


--
-- Name: checkpoint_progress uq_cp_sscp; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_progress
    ADD CONSTRAINT uq_cp_sscp UNIQUE (session_id, student_id, checkpoint_id);


--
-- Name: experiment_concepts uq_exp_concept; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiment_concepts
    ADD CONSTRAINT uq_exp_concept UNIQUE (experiment_id, concept);


--
-- Name: free_progress uq_free_progress; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_progress
    ADD CONSTRAINT uq_free_progress UNIQUE (user_id, exercise_id);


--
-- Name: ai_feature_configs uq_inst_feature_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feature_configs
    ADD CONSTRAINT uq_inst_feature_id UNIQUE (institution_id, feature_id);


--
-- Name: institution_daily_kpis uq_inst_snapshot_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_daily_kpis
    ADD CONSTRAINT uq_inst_snapshot_date UNIQUE (institution_id, snapshot_date);


--
-- Name: ai_user_quotas uq_inst_user_quota; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_user_quotas
    ADD CONSTRAINT uq_inst_user_quota UNIQUE (institution_id, user_id);


--
-- Name: practice_bookmarks uq_practice_bookmark; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_bookmarks
    ADD CONSTRAINT uq_practice_bookmark UNIQUE (user_id, problem_id);


--
-- Name: rank_snapshots uq_rank_snap_student_scope_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rank_snapshots
    ADD CONSTRAINT uq_rank_snap_student_scope_period UNIQUE (student_id, scope_level, scope_id, period);


--
-- Name: practice_student_badges uq_student_badge; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_student_badges
    ADD CONSTRAINT uq_student_badge UNIQUE (student_id, badge_id);


--
-- Name: platform_rating_periods uq_student_period_rating; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_rating_periods
    ADD CONSTRAINT uq_student_period_rating UNIQUE (student_id, period_type, period_key);


--
-- Name: practice_plan_progress uq_student_plan; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_plan_progress
    ADD CONSTRAINT uq_student_plan UNIQUE (student_id, plan_id);


--
-- Name: practice_quest_claims uq_student_quest_claim; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_quest_claims
    ADD CONSTRAINT uq_student_quest_claim UNIQUE (student_id, quest_key);


--
-- Name: student_rankings uq_student_section_subject; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_rankings
    ADD CONSTRAINT uq_student_section_subject UNIQUE (student_id, section_subject_id);


--
-- Name: student_metric_snapshots uq_student_snapshot_date_ss; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_metric_snapshots
    ADD CONSTRAINT uq_student_snapshot_date_ss UNIQUE (student_id, snapshot_date, section_subject_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: viva_answers viva_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viva_answers
    ADD CONSTRAINT viva_answers_pkey PRIMARY KEY (id);


--
-- Name: viva_sessions viva_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viva_sessions
    ADD CONSTRAINT viva_sessions_pkey PRIMARY KEY (id);


--
-- Name: idx_groq_usage_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groq_usage_date ON public.groq_usage USING btree (usage_date);


--
-- Name: ix_academic_years_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_academic_years_institution_id ON public.academic_years USING btree (institution_id);


--
-- Name: ix_admin_chat_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_chat_messages_created_at ON public.admin_chat_messages USING btree (created_at);


--
-- Name: ix_admin_chat_messages_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_chat_messages_session_id ON public.admin_chat_messages USING btree (session_id);


--
-- Name: ix_admin_chat_sessions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_chat_sessions_created_at ON public.admin_chat_sessions USING btree (created_at);


--
-- Name: ix_admin_chat_sessions_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_chat_sessions_institution_id ON public.admin_chat_sessions USING btree (institution_id);


--
-- Name: ix_admin_chat_sessions_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_chat_sessions_updated_at ON public.admin_chat_sessions USING btree (updated_at);


--
-- Name: ix_admin_chat_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_chat_sessions_user_id ON public.admin_chat_sessions USING btree (user_id);


--
-- Name: ix_admin_chat_sessions_user_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_chat_sessions_user_role ON public.admin_chat_sessions USING btree (user_id, role_scope);


--
-- Name: ix_ai_agent_run_inst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_agent_run_inst ON public.ai_agent_run USING btree (institution_id, created_at);


--
-- Name: ix_ai_feature_configs_feature_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_feature_configs_feature_id ON public.ai_feature_configs USING btree (feature_id);


--
-- Name: ix_ai_feature_configs_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_feature_configs_institution_id ON public.ai_feature_configs USING btree (institution_id);


--
-- Name: ix_ai_generated_documents_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_generated_documents_conversation_id ON public.ai_generated_documents USING btree (conversation_id);


--
-- Name: ix_ai_generated_documents_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_generated_documents_created_at ON public.ai_generated_documents USING btree (created_at);


--
-- Name: ix_ai_generated_documents_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_generated_documents_institution_id ON public.ai_generated_documents USING btree (institution_id);


--
-- Name: ix_ai_generated_documents_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_generated_documents_user_id ON public.ai_generated_documents USING btree (user_id);


--
-- Name: ix_ai_usage_inst_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_usage_inst_date ON public.ai_usage_log USING btree (institution_id, created_at);


--
-- Name: ix_ai_usage_inst_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_usage_inst_feature ON public.ai_usage_log USING btree (institution_id, feature);


--
-- Name: ix_ai_usage_inst_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_usage_inst_user_date ON public.ai_usage_log USING btree (institution_id, user_id, created_at);


--
-- Name: ix_ai_user_quotas_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_user_quotas_institution_id ON public.ai_user_quotas USING btree (institution_id);


--
-- Name: ix_ai_user_quotas_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ai_user_quotas_user_id ON public.ai_user_quotas USING btree (user_id);


--
-- Name: ix_announcement_interactions_announcement_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcement_interactions_announcement_id ON public.announcement_interactions USING btree (announcement_id);


--
-- Name: ix_announcement_interactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcement_interactions_user_id ON public.announcement_interactions USING btree (user_id);


--
-- Name: ix_announcements_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_author_id ON public.announcements USING btree (author_id);


--
-- Name: ix_announcements_inst_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_inst_created ON public.announcements USING btree (institution_id, created_at);


--
-- Name: ix_announcements_inst_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_inst_status ON public.announcements USING btree (institution_id, status);


--
-- Name: ix_announcements_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_institution_id ON public.announcements USING btree (institution_id);


--
-- Name: ix_announcements_send_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_send_at ON public.announcements USING btree (send_at);


--
-- Name: ix_announcements_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_announcements_status ON public.announcements USING btree (status);


--
-- Name: ix_audit_logs_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_actor_id ON public.audit_logs USING btree (actor_id);


--
-- Name: ix_audit_logs_institution_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_institution_action ON public.audit_logs USING btree (institution_id, action);


--
-- Name: ix_audit_logs_institution_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_institution_created ON public.audit_logs USING btree (institution_id, created_at);


--
-- Name: ix_audit_logs_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_institution_id ON public.audit_logs USING btree (institution_id);


--
-- Name: ix_audit_logs_institution_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_institution_module ON public.audit_logs USING btree (institution_id, module);


--
-- Name: ix_audit_logs_institution_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_institution_severity ON public.audit_logs USING btree (institution_id, severity);


--
-- Name: ix_batches_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_batches_department_id ON public.batches USING btree (department_id);


--
-- Name: ix_batches_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_batches_institution_id ON public.batches USING btree (institution_id);


--
-- Name: ix_batches_year_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_batches_year_id ON public.batches USING btree (year_id);


--
-- Name: ix_chat_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_session ON public.chat_messages USING btree (session_id);


--
-- Name: ix_checkpoints_experiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_checkpoints_experiment ON public.checkpoints USING btree (experiment_id);


--
-- Name: ix_citem_coll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_citem_coll ON public.collection_items USING btree (collection_id);


--
-- Name: ix_code_attempts_exp_final_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_attempts_exp_final_submitted ON public.code_attempts USING btree (experiment_id, is_final_submission, submitted_at);


--
-- Name: ix_code_attempts_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_attempts_experiment_id ON public.code_attempts USING btree (experiment_id);


--
-- Name: ix_code_attempts_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_attempts_session_id ON public.code_attempts USING btree (session_id);


--
-- Name: ix_code_attempts_student_exp_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_attempts_student_exp_sub ON public.code_attempts USING btree (student_id, experiment_id, submitted_at);


--
-- Name: ix_code_attempts_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_attempts_student_id ON public.code_attempts USING btree (student_id);


--
-- Name: ix_code_attempts_student_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_attempts_student_sub ON public.code_attempts USING btree (student_id, submitted_at);


--
-- Name: ix_code_versions_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_versions_experiment_id ON public.code_versions USING btree (experiment_id);


--
-- Name: ix_code_versions_session_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_versions_session_student ON public.code_versions USING btree (session_id, student_id, saved_at);


--
-- Name: ix_code_versions_student_exp_ver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_versions_student_exp_ver ON public.code_versions USING btree (student_id, experiment_id, version_number);


--
-- Name: ix_code_versions_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_code_versions_student_id ON public.code_versions USING btree (student_id);


--
-- Name: ix_compliance_settings_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_compliance_settings_institution_id ON public.compliance_settings USING btree (institution_id);


--
-- Name: ix_concept_mastery_inst_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_concept_mastery_inst_concept ON public.concept_mastery USING btree (institution_id, concept);


--
-- Name: ix_concept_mastery_inst_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_concept_mastery_inst_student ON public.concept_mastery USING btree (institution_id, student_id);


--
-- Name: ix_concept_mastery_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_concept_mastery_institution_id ON public.concept_mastery USING btree (institution_id);


--
-- Name: ix_concept_prereqs_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_concept_prereqs_concept ON public.concept_prereqs USING btree (concept);


--
-- Name: ix_concept_prereqs_requires_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_concept_prereqs_requires_concept ON public.concept_prereqs USING btree (requires_concept);


--
-- Name: ix_concept_prereqs_subject_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_concept_prereqs_subject_id ON public.concept_prereqs USING btree (subject_id);


--
-- Name: ix_content_modules_exp_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_content_modules_exp_order ON public.content_modules USING btree (experiment_id, display_order);


--
-- Name: ix_content_modules_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_content_modules_experiment_id ON public.content_modules USING btree (experiment_id);


--
-- Name: ix_content_modules_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_content_modules_page_id ON public.content_modules USING btree (page_id);


--
-- Name: ix_content_pages_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_content_pages_experiment_id ON public.content_pages USING btree (experiment_id);


--
-- Name: ix_content_progress_module_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_content_progress_module_id ON public.content_progress USING btree (module_id);


--
-- Name: ix_contest_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contest_window ON public.coding_contests USING btree (starts_at, ends_at);


--
-- Name: ix_cp_session_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cp_session_checkpoint ON public.checkpoint_progress USING btree (session_id, checkpoint_id);


--
-- Name: ix_cp_session_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cp_session_student ON public.checkpoint_progress USING btree (session_id, student_id);


--
-- Name: ix_cpart_contest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cpart_contest ON public.contest_participants USING btree (contest_id);


--
-- Name: ix_departments_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_departments_institution_id ON public.departments USING btree (institution_id);


--
-- Name: ix_email_otps_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_email_otps_email ON public.email_otps USING btree (email);


--
-- Name: ix_email_otps_email_purpose_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_email_otps_email_purpose_created ON public.email_otps USING btree (email, purpose, created_at);


--
-- Name: ix_environment_profiles_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_environment_profiles_institution_id ON public.environment_profiles USING btree (institution_id);


--
-- Name: ix_exam_attempts_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exam_attempts_exam ON public.exam_attempts USING btree (exam_id);


--
-- Name: ix_exam_attempts_exam_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exam_attempts_exam_student ON public.exam_attempts USING btree (exam_id, student_id);


--
-- Name: ix_exam_attempts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exam_attempts_student ON public.exam_attempts USING btree (student_id);


--
-- Name: ix_exam_attempts_student_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exam_attempts_student_exam ON public.exam_attempts USING btree (student_id, exam_id);


--
-- Name: ix_exam_attempts_student_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exam_attempts_student_exp ON public.exam_attempts USING btree (student_id, experiment_id);


--
-- Name: ix_exam_questions_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exam_questions_exam ON public.exam_questions USING btree (exam_id);


--
-- Name: ix_exam_questions_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exam_questions_exp ON public.exam_questions USING btree (experiment_id, display_order);


--
-- Name: ix_exams_inst_subj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exams_inst_subj ON public.exams USING btree (institution_id, subject_id);


--
-- Name: ix_exams_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exams_institution ON public.exams USING btree (institution_id);


--
-- Name: ix_exams_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_exams_subject ON public.exams USING btree (subject_id);


--
-- Name: ix_experiment_concepts_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_experiment_concepts_concept ON public.experiment_concepts USING btree (concept);


--
-- Name: ix_experiment_concepts_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_experiment_concepts_experiment_id ON public.experiment_concepts USING btree (experiment_id);


--
-- Name: ix_experiments_inst_subj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_experiments_inst_subj ON public.experiments USING btree (institution_id, subject_id);


--
-- Name: ix_experiments_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_experiments_institution_id ON public.experiments USING btree (institution_id);


--
-- Name: ix_experiments_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_experiments_instructor ON public.experiments USING btree (instructor_id);


--
-- Name: ix_experiments_instructor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_experiments_instructor_id ON public.experiments USING btree (instructor_id);


--
-- Name: ix_experiments_subject_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_experiments_subject_id ON public.experiments USING btree (subject_id);


--
-- Name: ix_extension_inst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_extension_inst ON public.extensions USING btree (institution_id);


--
-- Name: ix_extension_student_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_extension_student_exp ON public.extensions USING btree (student_id, experiment_id);


--
-- Name: ix_faq_articles_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_faq_articles_category ON public.faq_articles USING btree (category);


--
-- Name: ix_focus_scores_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_focus_scores_session_id ON public.focus_scores USING btree (session_id);


--
-- Name: ix_focus_scores_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_focus_scores_student_id ON public.focus_scores USING btree (student_id);


--
-- Name: ix_free_exercises_course_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_free_exercises_course_order ON public.free_exercises USING btree (course_id, order_index);


--
-- Name: ix_free_progress_user_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_free_progress_user_course ON public.free_progress USING btree (user_id, course_id, status);


--
-- Name: ix_grades_exp_final; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_grades_exp_final ON public.grades USING btree (experiment_id, final_grade);


--
-- Name: ix_grades_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_grades_experiment_id ON public.grades USING btree (experiment_id);


--
-- Name: ix_grades_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_grades_session_id ON public.grades USING btree (session_id);


--
-- Name: ix_grades_student_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_grades_student_created ON public.grades USING btree (student_id, created_at);


--
-- Name: ix_grades_student_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_grades_student_exp ON public.grades USING btree (student_id, experiment_id);


--
-- Name: ix_grades_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_grades_student_id ON public.grades USING btree (student_id);


--
-- Name: ix_hint_logs_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hint_logs_experiment_id ON public.hint_logs USING btree (experiment_id);


--
-- Name: ix_hint_logs_experiment_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hint_logs_experiment_student ON public.hint_logs USING btree (experiment_id, student_id);


--
-- Name: ix_hint_logs_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_hint_logs_student_id ON public.hint_logs USING btree (student_id);


--
-- Name: ix_inline_comments_grade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_inline_comments_grade_id ON public.inline_comments USING btree (grade_id);


--
-- Name: ix_inst_docs_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_inst_docs_scope ON public.institution_documents USING btree (scope_type, scope_id);


--
-- Name: ix_institution_daily_kpis_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_institution_daily_kpis_institution_id ON public.institution_daily_kpis USING btree (institution_id);


--
-- Name: ix_institution_daily_kpis_snapshot_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_institution_daily_kpis_snapshot_date ON public.institution_daily_kpis USING btree (snapshot_date);


--
-- Name: ix_institution_documents_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_institution_documents_institution_id ON public.institution_documents USING btree (institution_id);


--
-- Name: ix_intervention_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_intervention_created ON public.interventions USING btree (created_at);


--
-- Name: ix_intervention_followup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_intervention_followup ON public.interventions USING btree (follow_up_at);


--
-- Name: ix_intervention_inst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_intervention_inst ON public.interventions USING btree (institution_id);


--
-- Name: ix_intervention_student_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_intervention_student_status ON public.interventions USING btree (student_id, outcome);


--
-- Name: ix_invoices_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_invoices_institution_id ON public.invoices USING btree (institution_id);


--
-- Name: ix_invoices_invoice_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_invoices_invoice_number ON public.invoices USING btree (invoice_number);


--
-- Name: ix_lab_sessions_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lab_sessions_experiment_id ON public.lab_sessions USING btree (experiment_id);


--
-- Name: ix_lab_sessions_iid_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lab_sessions_iid_scheduled ON public.lab_sessions USING btree (institution_id, scheduled_at);


--
-- Name: ix_lab_sessions_iid_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lab_sessions_iid_status_scheduled ON public.lab_sessions USING btree (institution_id, status, scheduled_at);


--
-- Name: ix_lab_sessions_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lab_sessions_institution_id ON public.lab_sessions USING btree (institution_id);


--
-- Name: ix_lab_sessions_institution_id_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lab_sessions_institution_id_status ON public.lab_sessions USING btree (institution_id, status);


--
-- Name: ix_lab_sessions_section_subject_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lab_sessions_section_subject_id ON public.lab_sessions USING btree (section_subject_id);


--
-- Name: ix_lab_sessions_ss_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lab_sessions_ss_status_scheduled ON public.lab_sessions USING btree (section_subject_id, status, scheduled_at);


--
-- Name: ix_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: ix_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_user_unread ON public.notifications USING btree (user_id, is_read, created_at);


--
-- Name: ix_payment_methods_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_payment_methods_institution_id ON public.payment_methods USING btree (institution_id);


--
-- Name: ix_pbookmark_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pbookmark_user ON public.practice_bookmarks USING btree (user_id);


--
-- Name: ix_pcoll_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pcoll_user ON public.problem_collections USING btree (user_id);


--
-- Name: ix_pgsess_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pgsess_slug ON public.playground_sessions USING btree (share_slug);


--
-- Name: ix_pgsess_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pgsess_user ON public.playground_sessions USING btree (user_id);


--
-- Name: ix_plagiarism_flags_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_plagiarism_flags_experiment_id ON public.plagiarism_flags USING btree (experiment_id);


--
-- Name: ix_plagiarism_flags_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_plagiarism_flags_institution_id ON public.plagiarism_flags USING btree (institution_id);


--
-- Name: ix_plagiarism_flags_institution_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_plagiarism_flags_institution_status ON public.plagiarism_flags USING btree (institution_id, status);


--
-- Name: ix_plagiarism_flags_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_plagiarism_flags_session_id ON public.plagiarism_flags USING btree (session_id);


--
-- Name: ix_platform_rating_periods_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_platform_rating_periods_student_id ON public.platform_rating_periods USING btree (student_id);


--
-- Name: ix_platform_ratings_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_platform_ratings_rating ON public.platform_ratings USING btree (rating);


--
-- Name: ix_poll_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_poll_session ON public.session_polls USING btree (session_id);


--
-- Name: ix_practice_plan_progress_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_plan_progress_plan_id ON public.practice_plan_progress USING btree (plan_id);


--
-- Name: ix_practice_plan_progress_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_plan_progress_student_id ON public.practice_plan_progress USING btree (student_id);


--
-- Name: ix_practice_plan_sections_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_plan_sections_plan_id ON public.practice_plan_sections USING btree (plan_id);


--
-- Name: ix_practice_problems_lc_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_problems_lc_id ON public.practice_problems USING btree (lc_id);


--
-- Name: ix_practice_problems_nexlab_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_problems_nexlab_topic ON public.practice_problems USING btree (nexlab_topic);


--
-- Name: ix_practice_problems_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_practice_problems_slug ON public.practice_problems USING btree (slug);


--
-- Name: ix_practice_quest_claims_quest_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_quest_claims_quest_key ON public.practice_quest_claims USING btree (quest_key);


--
-- Name: ix_practice_quest_claims_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_quest_claims_student_id ON public.practice_quest_claims USING btree (student_id);


--
-- Name: ix_practice_student_badges_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_student_badges_student_id ON public.practice_student_badges USING btree (student_id);


--
-- Name: ix_practice_student_xp_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_practice_student_xp_student_id ON public.practice_student_xp USING btree (student_id);


--
-- Name: ix_practice_submissions_problem_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_submissions_problem_id ON public.practice_submissions USING btree (problem_id);


--
-- Name: ix_practice_submissions_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_submissions_student_id ON public.practice_submissions USING btree (student_id);


--
-- Name: ix_practice_subs_stu_run_status_dt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_subs_stu_run_status_dt ON public.practice_submissions USING btree (student_id, is_run, status, submitted_at);


--
-- Name: ix_practice_test_cases_problem_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_practice_test_cases_problem_id ON public.practice_test_cases USING btree (problem_id);


--
-- Name: ix_proctor_events_inst_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_proctor_events_inst_date ON public.proctor_events USING btree (institution_id, recorded_at);


--
-- Name: ix_proctor_events_inst_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_proctor_events_inst_session ON public.proctor_events USING btree (institution_id, session_id);


--
-- Name: ix_proctor_events_inst_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_proctor_events_inst_student ON public.proctor_events USING btree (institution_id, student_id);


--
-- Name: ix_qbank_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_qbank_creator ON public.question_bank USING btree (created_by);


--
-- Name: ix_qbank_inst; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_qbank_inst ON public.question_bank USING btree (institution_id);


--
-- Name: ix_quiz_questions_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_quiz_questions_module ON public.quiz_questions USING btree (module_id);


--
-- Name: ix_quiz_questions_module_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_quiz_questions_module_id ON public.quiz_questions USING btree (module_id);


--
-- Name: ix_rank_snap_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_rank_snap_lookup ON public.rank_snapshots USING btree (scope_level, scope_id, period, rank_position);


--
-- Name: ix_rank_snapshots_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_rank_snapshots_institution_id ON public.rank_snapshots USING btree (institution_id);


--
-- Name: ix_rank_snapshots_scope_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_rank_snapshots_scope_id ON public.rank_snapshots USING btree (scope_id);


--
-- Name: ix_rank_snapshots_scope_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_rank_snapshots_scope_level ON public.rank_snapshots USING btree (scope_level);


--
-- Name: ix_rank_snapshots_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_rank_snapshots_student_id ON public.rank_snapshots USING btree (student_id);


--
-- Name: ix_reports_inst_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reports_inst_creator ON public.reports USING btree (institution_id, created_by);


--
-- Name: ix_sched_ann_inst_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sched_ann_inst_status ON public.scheduled_announcements USING btree (institution_id, status);


--
-- Name: ix_sched_ann_status_sendat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sched_ann_status_sendat ON public.scheduled_announcements USING btree (status, send_at);


--
-- Name: ix_section_students_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_section_students_student_id ON public.section_students USING btree (student_id);


--
-- Name: ix_section_subjects_inst_instr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_section_subjects_inst_instr ON public.section_subjects USING btree (institution_id, instructor_id);


--
-- Name: ix_section_subjects_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_section_subjects_institution_id ON public.section_subjects USING btree (institution_id);


--
-- Name: ix_section_subjects_instructor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_section_subjects_instructor_id ON public.section_subjects USING btree (instructor_id);


--
-- Name: ix_section_subjects_sec_subj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_section_subjects_sec_subj ON public.section_subjects USING btree (section_id, subject_id);


--
-- Name: ix_section_subjects_section_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_section_subjects_section_id ON public.section_subjects USING btree (section_id);


--
-- Name: ix_section_subjects_subject_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_section_subjects_subject_id ON public.section_subjects USING btree (subject_id);


--
-- Name: ix_sections_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sections_batch_id ON public.sections USING btree (batch_id);


--
-- Name: ix_sections_class_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sections_class_teacher_id ON public.sections USING btree (class_teacher_id);


--
-- Name: ix_sections_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sections_institution_id ON public.sections USING btree (institution_id);


--
-- Name: ix_security_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_security_events_created_at ON public.security_events USING btree (created_at);


--
-- Name: ix_security_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_security_events_event_type ON public.security_events USING btree (event_type);


--
-- Name: ix_security_events_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_security_events_institution_id ON public.security_events USING btree (institution_id);


--
-- Name: ix_security_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_security_events_user_id ON public.security_events USING btree (user_id);


--
-- Name: ix_session_attendance_session_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_session_attendance_session_status ON public.session_attendance USING btree (session_id, status);


--
-- Name: ix_session_attendance_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_session_attendance_student_id ON public.session_attendance USING btree (student_id);


--
-- Name: ix_session_attendance_student_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_session_attendance_student_status ON public.session_attendance USING btree (student_id, status);


--
-- Name: ix_session_feedback_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_session_feedback_institution_id ON public.session_feedback USING btree (institution_id);


--
-- Name: ix_session_feedback_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_session_feedback_session_id ON public.session_feedback USING btree (session_id);


--
-- Name: ix_session_feedback_session_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_session_feedback_session_submitted ON public.session_feedback USING btree (session_id, submitted_at);


--
-- Name: ix_feedback_receipts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_feedback_receipts_student ON public.session_feedback_receipts USING btree (student_id);


--
-- Name: ix_sms_inst_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sms_inst_date ON public.student_metric_snapshots USING btree (institution_id, snapshot_date);


--
-- Name: ix_smt_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_smt_session ON public.session_mode_transitions USING btree (session_id);


--
-- Name: ix_student_metric_snapshots_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_student_metric_snapshots_institution_id ON public.student_metric_snapshots USING btree (institution_id);


--
-- Name: ix_student_metric_snapshots_section_subject_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_student_metric_snapshots_section_subject_id ON public.student_metric_snapshots USING btree (section_subject_id);


--
-- Name: ix_student_metric_snapshots_snapshot_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_student_metric_snapshots_snapshot_date ON public.student_metric_snapshots USING btree (snapshot_date);


--
-- Name: ix_student_metric_snapshots_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_student_metric_snapshots_student_id ON public.student_metric_snapshots USING btree (student_id);


--
-- Name: ix_student_rankings_section_subject_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_student_rankings_section_subject_id ON public.student_rankings USING btree (section_subject_id);


--
-- Name: ix_student_rankings_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_student_rankings_student_id ON public.student_rankings USING btree (student_id);


--
-- Name: ix_subjects_inst_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_subjects_inst_dept ON public.subjects USING btree (institution_id, department_id);


--
-- Name: ix_subjects_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_subjects_institution_id ON public.subjects USING btree (institution_id);


--
-- Name: ix_support_tickets_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_support_tickets_institution_id ON public.support_tickets USING btree (institution_id);


--
-- Name: ix_support_tickets_ticket_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_support_tickets_ticket_number ON public.support_tickets USING btree (ticket_number);


--
-- Name: ix_tcr_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tcr_attempt ON public.test_case_results USING btree (attempt_id);


--
-- Name: ix_tcr_test_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tcr_test_case ON public.test_case_results USING btree (test_case_id);


--
-- Name: ix_test_cases_experiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_test_cases_experiment ON public.test_cases USING btree (experiment_id);


--
-- Name: ix_test_cases_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_test_cases_experiment_id ON public.test_cases USING btree (experiment_id);


--
-- Name: ix_tnote_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tnote_student ON public.teacher_notes USING btree (student_id, created_at);


--
-- Name: ix_users_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_department_id ON public.users USING btree (department_id);


--
-- Name: ix_users_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_institution_id ON public.users USING btree (institution_id);


--
-- Name: ix_users_institution_id_full_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_institution_id_full_name ON public.users USING btree (institution_id, full_name);


--
-- Name: ix_users_institution_id_role_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_institution_id_role_is_active ON public.users USING btree (institution_id, role, is_active);


--
-- Name: ix_viva_answers_viva_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_viva_answers_viva_session_id ON public.viva_answers USING btree (viva_session_id);


--
-- Name: ix_viva_sessions_experiment_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_viva_sessions_experiment_created ON public.viva_sessions USING btree (experiment_id, created_at);


--
-- Name: ix_viva_sessions_experiment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_viva_sessions_experiment_id ON public.viva_sessions USING btree (experiment_id);


--
-- Name: ix_viva_sessions_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_viva_sessions_student_id ON public.viva_sessions USING btree (student_id);


--
-- Name: ix_xp_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_xp_slug ON public.practice_student_xp USING btree (profile_slug);


--
-- Name: trgm_audit_detail; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trgm_audit_detail ON public.audit_logs USING gin (detail public.gin_trgm_ops);


--
-- Name: trgm_section_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trgm_section_name ON public.sections USING gin (name public.gin_trgm_ops);


--
-- Name: trgm_session_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trgm_session_title ON public.lab_sessions USING gin (title public.gin_trgm_ops);


--
-- Name: trgm_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trgm_users_email ON public.users USING gin (email public.gin_trgm_ops);


--
-- Name: trgm_users_full_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trgm_users_full_name ON public.users USING gin (full_name public.gin_trgm_ops);


--
-- Name: trgm_users_roll_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trgm_users_roll_number ON public.users USING gin (roll_number public.gin_trgm_ops);


--
-- Name: trgm_users_staff_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trgm_users_staff_id ON public.users USING gin (staff_id public.gin_trgm_ops);


--
-- Name: academic_years academic_years_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_years
    ADD CONSTRAINT academic_years_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: admin_chat_messages admin_chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_chat_messages
    ADD CONSTRAINT admin_chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.admin_chat_sessions(id) ON DELETE CASCADE;


--
-- Name: admin_chat_sessions admin_chat_sessions_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_chat_sessions
    ADD CONSTRAINT admin_chat_sessions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: admin_chat_sessions admin_chat_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_chat_sessions
    ADD CONSTRAINT admin_chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ai_feature_configs ai_feature_configs_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feature_configs
    ADD CONSTRAINT ai_feature_configs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: ai_generated_documents ai_generated_documents_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_generated_documents
    ADD CONSTRAINT ai_generated_documents_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.admin_chat_sessions(id) ON DELETE SET NULL;


--
-- Name: ai_generated_documents ai_generated_documents_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_generated_documents
    ADD CONSTRAINT ai_generated_documents_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: ai_generated_documents ai_generated_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_generated_documents
    ADD CONSTRAINT ai_generated_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: ai_policy ai_policy_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_policy
    ADD CONSTRAINT ai_policy_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: ai_user_quotas ai_user_quotas_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_user_quotas
    ADD CONSTRAINT ai_user_quotas_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: ai_user_quotas ai_user_quotas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_user_quotas
    ADD CONSTRAINT ai_user_quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: analytics_config analytics_config_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_config
    ADD CONSTRAINT analytics_config_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: announcement_interactions announcement_interactions_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_interactions
    ADD CONSTRAINT announcement_interactions_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_interactions announcement_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_interactions
    ADD CONSTRAINT announcement_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: announcements announcements_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: batches batches_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: batches batches_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: batches batches_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_year_id_fkey FOREIGN KEY (year_id) REFERENCES public.academic_years(id);


--
-- Name: chat_messages chat_messages_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_from_id_fkey FOREIGN KEY (from_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: chat_messages chat_messages_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_to_id_fkey FOREIGN KEY (to_id) REFERENCES public.users(id);


--
-- Name: checkpoint_progress checkpoint_progress_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_progress
    ADD CONSTRAINT checkpoint_progress_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.checkpoints(id);


--
-- Name: checkpoint_progress checkpoint_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_progress
    ADD CONSTRAINT checkpoint_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: checkpoint_progress checkpoint_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_progress
    ADD CONSTRAINT checkpoint_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: checkpoints checkpoints_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: checkpoints checkpoints_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.content_pages(id);


--
-- Name: code_attempts code_attempts_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_attempts
    ADD CONSTRAINT code_attempts_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: code_attempts code_attempts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_attempts
    ADD CONSTRAINT code_attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: code_attempts code_attempts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_attempts
    ADD CONSTRAINT code_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: code_versions code_versions_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_versions
    ADD CONSTRAINT code_versions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: code_versions code_versions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_versions
    ADD CONSTRAINT code_versions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: code_versions code_versions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_versions
    ADD CONSTRAINT code_versions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: coding_contests coding_contests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coding_contests
    ADD CONSTRAINT coding_contests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: collection_items collection_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.problem_collections(id);


--
-- Name: collection_items collection_items_problem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_problem_id_fkey FOREIGN KEY (problem_id) REFERENCES public.practice_problems(id);


--
-- Name: compliance_settings compliance_settings_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_settings
    ADD CONSTRAINT compliance_settings_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: concept_mastery concept_mastery_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: concept_mastery concept_mastery_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: concept_prereqs concept_prereqs_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_prereqs
    ADD CONSTRAINT concept_prereqs_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: content_modules content_modules_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_modules
    ADD CONSTRAINT content_modules_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: content_pages content_pages_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_pages
    ADD CONSTRAINT content_pages_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: content_progress content_progress_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_progress
    ADD CONSTRAINT content_progress_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.content_modules(id);


--
-- Name: content_progress content_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_progress
    ADD CONSTRAINT content_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: contest_participants contest_participants_contest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_participants
    ADD CONSTRAINT contest_participants_contest_id_fkey FOREIGN KEY (contest_id) REFERENCES public.coding_contests(id);


--
-- Name: contest_participants contest_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contest_participants
    ADD CONSTRAINT contest_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: departments departments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: environment_profiles environment_profiles_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.environment_profiles
    ADD CONSTRAINT environment_profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: environment_profiles environment_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.environment_profiles
    ADD CONSTRAINT environment_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: environment_profiles environment_profiles_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.environment_profiles
    ADD CONSTRAINT environment_profiles_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: exam_attempts exam_attempts_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_attempts
    ADD CONSTRAINT exam_attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id);


--
-- Name: exam_attempts exam_attempts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_attempts
    ADD CONSTRAINT exam_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: exam_questions exam_questions_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_questions
    ADD CONSTRAINT exam_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id);


--
-- Name: exams exams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: exams exams_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: exams exams_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: experiment_concepts experiment_concepts_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiment_concepts
    ADD CONSTRAINT experiment_concepts_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: experiments experiments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: experiments experiments_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- Name: experiments experiments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: extensions extensions_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: extensions extensions_experiment_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_experiment_id_fkey1 FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: extensions extensions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: extensions extensions_granted_by_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_granted_by_fkey1 FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: extensions extensions_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: extensions extensions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: extensions extensions_student_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_student_id_fkey1 FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: content_modules fk_content_modules_page_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_modules
    ADD CONSTRAINT fk_content_modules_page_id FOREIGN KEY (page_id) REFERENCES public.content_pages(id);


--
-- Name: sections fk_sections_class_teacher_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT fk_sections_class_teacher_id FOREIGN KEY (class_teacher_id) REFERENCES public.users(id);


--
-- Name: users fk_users_department_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_department_id FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: focus_scores focus_scores_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.focus_scores
    ADD CONSTRAINT focus_scores_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: focus_scores focus_scores_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.focus_scores
    ADD CONSTRAINT focus_scores_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: free_exercises free_exercises_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_exercises
    ADD CONSTRAINT free_exercises_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.free_courses(id);


--
-- Name: free_progress free_progress_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_progress
    ADD CONSTRAINT free_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.free_courses(id);


--
-- Name: free_progress free_progress_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_progress
    ADD CONSTRAINT free_progress_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.free_exercises(id);


--
-- Name: free_progress free_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.free_progress
    ADD CONSTRAINT free_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: grades grades_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: grades grades_graded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES public.users(id);


--
-- Name: grades grades_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: grades grades_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: hint_logs hint_logs_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hint_logs
    ADD CONSTRAINT hint_logs_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: hint_logs hint_logs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hint_logs
    ADD CONSTRAINT hint_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: hint_logs hint_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hint_logs
    ADD CONSTRAINT hint_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: inline_comments inline_comments_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inline_comments
    ADD CONSTRAINT inline_comments_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.grades(id);


--
-- Name: institution_daily_kpis institution_daily_kpis_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_daily_kpis
    ADD CONSTRAINT institution_daily_kpis_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: institution_documents institution_documents_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_documents
    ADD CONSTRAINT institution_documents_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: institution_documents institution_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_documents
    ADD CONSTRAINT institution_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: instructor_settings instructor_settings_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_settings
    ADD CONSTRAINT instructor_settings_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- Name: interventions interventions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions
    ADD CONSTRAINT interventions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: interventions interventions_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions
    ADD CONSTRAINT interventions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: interventions interventions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interventions
    ADD CONSTRAINT interventions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: invoices invoices_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: lab_sessions lab_sessions_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_sessions
    ADD CONSTRAINT lab_sessions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: lab_sessions lab_sessions_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_sessions
    ADD CONSTRAINT lab_sessions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: lab_sessions lab_sessions_section_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_sessions
    ADD CONSTRAINT lab_sessions_section_subject_id_fkey FOREIGN KEY (section_subject_id) REFERENCES public.section_subjects(id);


--
-- Name: live_page_states live_page_states_current_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_page_states
    ADD CONSTRAINT live_page_states_current_page_id_fkey FOREIGN KEY (current_page_id) REFERENCES public.content_pages(id);


--
-- Name: live_page_states live_page_states_launched_quiz_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_page_states
    ADD CONSTRAINT live_page_states_launched_quiz_module_id_fkey FOREIGN KEY (launched_quiz_module_id) REFERENCES public.content_modules(id);


--
-- Name: live_page_states live_page_states_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_page_states
    ADD CONSTRAINT live_page_states_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: live_page_states live_page_states_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_page_states
    ADD CONSTRAINT live_page_states_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: payment_methods payment_methods_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: plagiarism_flags plagiarism_flags_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plagiarism_flags
    ADD CONSTRAINT plagiarism_flags_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: plagiarism_flags plagiarism_flags_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plagiarism_flags
    ADD CONSTRAINT plagiarism_flags_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: plagiarism_flags plagiarism_flags_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plagiarism_flags
    ADD CONSTRAINT plagiarism_flags_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: plagiarism_flags plagiarism_flags_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plagiarism_flags
    ADD CONSTRAINT plagiarism_flags_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: plagiarism_flags plagiarism_flags_student_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plagiarism_flags
    ADD CONSTRAINT plagiarism_flags_student_a_id_fkey FOREIGN KEY (student_a_id) REFERENCES public.users(id);


--
-- Name: plagiarism_flags plagiarism_flags_student_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plagiarism_flags
    ADD CONSTRAINT plagiarism_flags_student_b_id_fkey FOREIGN KEY (student_b_id) REFERENCES public.users(id);


--
-- Name: platform_config platform_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_config
    ADD CONSTRAINT platform_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: platform_rating_periods platform_rating_periods_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_rating_periods
    ADD CONSTRAINT platform_rating_periods_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: platform_ratings platform_ratings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_ratings
    ADD CONSTRAINT platform_ratings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: playground_sessions playground_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playground_sessions
    ADD CONSTRAINT playground_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: practice_bookmarks practice_bookmarks_problem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_bookmarks
    ADD CONSTRAINT practice_bookmarks_problem_id_fkey FOREIGN KEY (problem_id) REFERENCES public.practice_problems(id);


--
-- Name: practice_bookmarks practice_bookmarks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_bookmarks
    ADD CONSTRAINT practice_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: practice_plan_progress practice_plan_progress_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_plan_progress
    ADD CONSTRAINT practice_plan_progress_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.practice_study_plans(id);


--
-- Name: practice_plan_progress practice_plan_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_plan_progress
    ADD CONSTRAINT practice_plan_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: practice_plan_sections practice_plan_sections_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_plan_sections
    ADD CONSTRAINT practice_plan_sections_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.practice_study_plans(id);


--
-- Name: practice_quest_claims practice_quest_claims_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_quest_claims
    ADD CONSTRAINT practice_quest_claims_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: practice_student_badges practice_student_badges_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_student_badges
    ADD CONSTRAINT practice_student_badges_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: practice_student_xp practice_student_xp_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_student_xp
    ADD CONSTRAINT practice_student_xp_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: practice_submissions practice_submissions_problem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_submissions
    ADD CONSTRAINT practice_submissions_problem_id_fkey FOREIGN KEY (problem_id) REFERENCES public.practice_problems(id);


--
-- Name: practice_submissions practice_submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_submissions
    ADD CONSTRAINT practice_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: practice_test_cases practice_test_cases_problem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_test_cases
    ADD CONSTRAINT practice_test_cases_problem_id_fkey FOREIGN KEY (problem_id) REFERENCES public.practice_problems(id);


--
-- Name: problem_collections problem_collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.problem_collections
    ADD CONSTRAINT problem_collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: proctor_events proctor_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proctor_events
    ADD CONSTRAINT proctor_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id) ON DELETE CASCADE;


--
-- Name: proctor_events proctor_events_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proctor_events
    ADD CONSTRAINT proctor_events_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: proctor_policies proctor_policies_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proctor_policies
    ADD CONSTRAINT proctor_policies_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: proctor_policies proctor_policies_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proctor_policies
    ADD CONSTRAINT proctor_policies_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.content_pages(id);


--
-- Name: proctor_policies proctor_policies_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proctor_policies
    ADD CONSTRAINT proctor_policies_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: question_bank question_bank_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: question_bank question_bank_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: quiz_questions quiz_questions_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_questions
    ADD CONSTRAINT quiz_questions_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.content_modules(id);


--
-- Name: rank_snapshots rank_snapshots_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rank_snapshots
    ADD CONSTRAINT rank_snapshots_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: recurring_plans recurring_plans_academic_year_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_plans
    ADD CONSTRAINT recurring_plans_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id);


--
-- Name: recurring_plans recurring_plans_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_plans
    ADD CONSTRAINT recurring_plans_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: recurring_plans recurring_plans_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_plans
    ADD CONSTRAINT recurring_plans_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: recurring_plans recurring_plans_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_plans
    ADD CONSTRAINT recurring_plans_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: recurring_plans recurring_plans_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_plans
    ADD CONSTRAINT recurring_plans_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- Name: reports reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: scheduled_announcements scheduled_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_announcements
    ADD CONSTRAINT scheduled_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: scheduled_announcements scheduled_announcements_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_announcements
    ADD CONSTRAINT scheduled_announcements_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: section_students section_students_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_students
    ADD CONSTRAINT section_students_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id);


--
-- Name: section_students section_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_students
    ADD CONSTRAINT section_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: section_subjects section_subjects_co_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_subjects
    ADD CONSTRAINT section_subjects_co_instructor_id_fkey FOREIGN KEY (co_instructor_id) REFERENCES public.users(id);


--
-- Name: section_subjects section_subjects_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_subjects
    ADD CONSTRAINT section_subjects_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: section_subjects section_subjects_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_subjects
    ADD CONSTRAINT section_subjects_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id);


--
-- Name: section_subjects section_subjects_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_subjects
    ADD CONSTRAINT section_subjects_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id);


--
-- Name: section_subjects section_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_subjects
    ADD CONSTRAINT section_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: sections sections_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: sections sections_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: security_events security_events_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: security_events security_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: session_attendance session_attendance_override_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_override_by_fkey FOREIGN KEY (override_by) REFERENCES public.users(id);


--
-- Name: session_attendance session_attendance_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: session_attendance session_attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: session_feedback session_feedback_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: session_feedback session_feedback_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: session_feedback_receipts session_feedback_receipts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback_receipts
    ADD CONSTRAINT session_feedback_receipts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id) ON DELETE CASCADE;


--
-- Name: session_feedback_receipts session_feedback_receipts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback_receipts
    ADD CONSTRAINT session_feedback_receipts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: session_mode_transitions session_mode_transitions_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_mode_transitions
    ADD CONSTRAINT session_mode_transitions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: session_mode_transitions session_mode_transitions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_mode_transitions
    ADD CONSTRAINT session_mode_transitions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: session_polls session_polls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_polls
    ADD CONSTRAINT session_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: session_polls session_polls_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_polls
    ADD CONSTRAINT session_polls_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.lab_sessions(id);


--
-- Name: student_metric_snapshots student_metric_snapshots_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_metric_snapshots
    ADD CONSTRAINT student_metric_snapshots_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: student_rankings student_rankings_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_rankings
    ADD CONSTRAINT student_rankings_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: student_rankings student_rankings_section_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_rankings
    ADD CONSTRAINT student_rankings_section_subject_id_fkey FOREIGN KEY (section_subject_id) REFERENCES public.section_subjects(id);


--
-- Name: student_rankings student_rankings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_rankings
    ADD CONSTRAINT student_rankings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: subjects subjects_env_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_env_profile_id_fkey FOREIGN KEY (env_profile_id) REFERENCES public.environment_profiles(id);


--
-- Name: subjects subjects_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: support_tickets support_tickets_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: teacher_notes teacher_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notes
    ADD CONSTRAINT teacher_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: teacher_notes teacher_notes_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notes
    ADD CONSTRAINT teacher_notes_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: teacher_notes teacher_notes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notes
    ADD CONSTRAINT teacher_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: test_case_results test_case_results_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_case_results
    ADD CONSTRAINT test_case_results_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.code_attempts(id);


--
-- Name: test_case_results test_case_results_test_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_case_results
    ADD CONSTRAINT test_case_results_test_case_id_fkey FOREIGN KEY (test_case_id) REFERENCES public.test_cases(id);


--
-- Name: test_cases test_cases_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: users users_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: viva_answers viva_answers_viva_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viva_answers
    ADD CONSTRAINT viva_answers_viva_session_id_fkey FOREIGN KEY (viva_session_id) REFERENCES public.viva_sessions(id);


--
-- Name: viva_sessions viva_sessions_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viva_sessions
    ADD CONSTRAINT viva_sessions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id);


--
-- Name: viva_sessions viva_sessions_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viva_sessions
    ADD CONSTRAINT viva_sessions_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.grades(id);


--
-- Name: viva_sessions viva_sessions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viva_sessions
    ADD CONSTRAINT viva_sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--


