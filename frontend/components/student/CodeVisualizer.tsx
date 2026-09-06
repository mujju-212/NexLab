'use client';

/**
 * CodeVisualizer — a Programiz-style step-through execution visualizer.
 *
 * How it works (no backend changes): the user's Python source is prefixed with
 * a `sys.settrace` tracer preamble and submitted through the normal sandboxed
 * `/execution/playground` endpoint. The tracer records one step per line/call/
 * return event (line number, stdout delta, and a snapshot of every live scope's
 * variables) and prints the whole trace as JSON on exit. This component parses
 * that trace and replays it: highlighted current line, step controls, live
 * variable/scope boxes, incremental stdout and a plain-English explanation.
 *
 * Python-only (sys.settrace). Other languages keep the normal Run flow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, Eye, X, ZoomIn, ZoomOut, Terminal, Boxes, MessageSquareText,
  Maximize2,
} from 'lucide-react';
import { executionService } from '@/services/execution.service';

interface VizScope { name: string; vars: Record<string, string> }
interface VizStep {
  line: number;                       // 1-based line in the USER source
  event: 'line' | 'call' | 'return';
  out: string;                        // stdout produced since previous step
  scopes: VizScope[];                 // outermost → innermost live frames
  ret: string | null;                 // return value (event === 'return')
}
interface VizTrace { steps: VizStep[]; tail: string }

const MARKER = '__VIZ_JSON__';

/** Tracer preamble.
 *
 *  sys.settrace does NOT emit events for the already-running module frame, so we
 *  can't trace top-level user code in place. Instead the user's source is
 *  compiled to its own code object (filename '<viz-user>', lines starting at 1)
 *  and exec'd inside _viz_runner(), a *function* frame that settrace does trace.
 *  Every user line then fires 'line' events and f_lineno maps 1:1 onto the user's
 *  source (no offset needed). '__USER_SRC__' is replaced with the raw user code. */
const PREAMBLE_LINES = [
  'import sys, io, json, types, atexit',
  '_VIZ_STEPS = []',
  '_VIZ_BUF = io.StringIO()',
  '_VIZ_REAL = sys.stdout',
  '_VIZ_POS = 0',
  '_VIZ_LIMIT = 300',
  "_VIZ_FN = '<viz-user>'",
  "_VIZ_SRC = r'''__USER_SRC__'''",
  'def _viz_val(v):',
  '    try:',
  '        if isinstance(v, str):',
  "            v = v.rstrip('\\r')",
  '        s = repr(v)',
  '        return s if len(s) <= 48 else s[:45] + "..."',
  '    except Exception:',
  '        return "<object>"',
  'def _viz_vars(f):',
  '    out = {}',
  '    for k, v in f.f_locals.items():',
  '        if k.startswith("_VIZ") or k.startswith("_viz"):',
  '            continue',
  '        if k.startswith("__") and k.endswith("__"):',
  '            continue',
  '        if isinstance(v, (types.ModuleType, types.FunctionType, types.CodeType)):',
  '            continue',
  '        if len(out) >= 12:',
  '            break',
  '        out[k] = _viz_val(v)',
  '    return out',
  'def _viz_push(frame, event, arg):',
  '    global _VIZ_POS',
  '    buf = _VIZ_BUF.getvalue()',
  "    delta = buf[_VIZ_POS:].replace('\\r', '')",
  '    _VIZ_POS = len(buf)',
  '    stack = []',
  '    f = frame',
  '    while f is not None:',
  '        if f.f_code.co_filename == _VIZ_FN:',
  "            stack.append({'name': f.f_code.co_name, 'vars': _viz_vars(f)})",
  '        f = f.f_back',
  '    stack.reverse()',
  '    _VIZ_STEPS.append({',
  "        'line': frame.f_lineno,",
  "        'event': event,",
  "        'out': delta,",
  "        'scopes': stack,",
  "        'ret': _viz_val(arg) if event == 'return' else None,",
  '    })',
  'def _viz_trace(frame, event, arg):',
  '    if len(_VIZ_STEPS) >= _VIZ_LIMIT:',
  '        return None',
  "    if frame.f_code.co_filename == _VIZ_FN and frame.f_lineno >= 1:",
  "        if event in ('line', 'call', 'return'):",
  '            _viz_push(frame, event, arg)',
  '    return _viz_trace',
  'def _viz_finish():',
  '    sys.settrace(None)',
  '    sys.stdout = _VIZ_REAL',
  '    tail = _VIZ_BUF.getvalue()[_VIZ_POS:]',
  "    _VIZ_REAL.write('\\n" + MARKER + "\\n')",
  "    _VIZ_REAL.write(json.dumps({'steps': _VIZ_STEPS, 'tail': tail}))",
  "    _VIZ_REAL.write('\\n')",
  'atexit.register(_viz_finish)',
  'def _viz_runner():',
  '    _VIZ_CODE = compile(_VIZ_SRC, _VIZ_FN, "exec")',
  '    sys.stdout = _VIZ_BUF',
  '    sys.settrace(_viz_trace)',
  '    try:',
  '        exec(_VIZ_CODE, {"__name__": "__main__", "__builtins__": __builtins__})',
  '    finally:',
  '        sys.settrace(None)',
  '        sys.stdout = _VIZ_REAL',
  '_viz_runner()',
];

function buildTracedSource(userCode: string): string {
  // A trailing backslash or a ''' sequence would break the r'''...''' literal,
  // so neutralise those before embedding (rare in student code).
  const safe = userCode.replace(/\\$/m, '').replace(/'''/g, "' ' '");
  return PREAMBLE_LINES.join('\n').replace('__USER_SRC__', safe);
}

function parseTrace(stdout: string): VizTrace | null {
  const i = stdout.indexOf(MARKER);
  if (i === -1) return null;
  const jsonText = stdout.slice(i + MARKER.length).trim();
  try {
    const raw = JSON.parse(jsonText) as VizTrace;
    if (!Array.isArray(raw.steps)) return null;
    return { steps: raw.steps, tail: raw.tail || '' };
  } catch {
    return null;
  }
}

/** Plain-English explanation for the current step (rule-based, offline). */
function explain(step: VizStep, lineText: string): string {
  const t = lineText.trim();
  const lookup = (name: string): string | undefined => {
    for (let s = step.scopes.length - 1; s >= 0; s--) {
      if (name in step.scopes[s].vars) return step.scopes[s].vars[name];
    }
    return undefined;
  };
  if (step.event === 'call') {
    const name = step.scopes[step.scopes.length - 1]?.name || 'function';
    return `The function \`${name}\` is called.`;
  }
  if (step.event === 'return') {
    const name = step.scopes[step.scopes.length - 1]?.name || 'function';
    return `The function \`${name}\` returns ${step.ret ?? 'None'}.`;
  }
  if (/input\s*\(/.test(t)) {
    const m = t.match(/^(\w+)\s*=(?!=)/);
    return m
      ? `The value entered by the user, ${lookup(m[1]) ?? '…'}, is assigned to the variable \`${m[1]}\`.`
      : 'The program reads a value from the user.';
  }
  if (/^print\s*\(/.test(t)) return 'The program prints output to the console.';
  const asg = t.match(/^(\w+)\s*=(?!=)/);
  if (asg) return `The value ${lookup(asg[1]) ?? '…'} is assigned to the variable \`${asg[1]}\`.`;
  if (/^for\s/.test(t)) return 'A loop iteration begins — the loop variable is updated.';
  if (/^while\s/.test(t)) return 'The while-loop condition is evaluated.';
  if (/^(if|elif)\b/.test(t)) return 'The condition is evaluated to decide which branch runs.';
  if (/^else\s*:/.test(t)) return 'The else branch runs.';
  if (/^return\b/.test(t)) return 'The function returns a value to its caller.';
  if (/^import\s|^from\s/.test(t)) return 'A module is imported.';
  return `Execute: \`${t}\``;
}

const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export default function CodeVisualizer({ code, stdin, onExit, embedded = false, onExpand }: {
  code: string;
  stdin?: string;
  onExit?: () => void;
  embedded?: boolean;
  onExpand?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runError, setRunError] = useState('');
  const [trace, setTrace] = useState<VizTrace | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(100);
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = useCallback(async () => {
    setLoading(true); setError(''); setRunError(''); setTrace(null); setIdx(0); setPlaying(false);
    try {
      const res = await executionService.runPlayground({
        code: buildTracedSource(code), language: 'python', stdin: stdin || undefined,
      });
      const t = parseTrace(res.stdout || '');
      if (!t || t.steps.length === 0) {
        setError(res.stderr || res.compile_output || res.status || 'Could not trace this program.');
      } else {
        setTrace(t);
        // Program crashed part-way: keep the partial trace but flag the error so
        // the student sees both where it stopped and why.
        if (!res.success) {
          const lastLine = (res.stderr || '').trim().split('\n').filter(Boolean).pop();
          setRunError(lastLine || res.status || 'The program stopped early.');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Visualize run failed.');
    } finally {
      setLoading(false);
    }
  }, [code, stdin]);

  useEffect(() => { void run(); }, [run]);

  // Auto-play stepping
  useEffect(() => {
    if (!playing || !trace) return;
    playTimer.current = setInterval(() => {
      setIdx(i => {
        if (i >= trace.steps.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 700);
    return () => { if (playTimer.current) clearInterval(playTimer.current); };
  }, [playing, trace]);

  const steps = trace?.steps ?? [];
  const step = steps[idx];
  const codeLines = useMemo(() => code.split('\n'), [code]);

  // Cumulative stdout up to (and including) the current step
  const stdoutSoFar = useMemo(() => {
    if (!trace) return '';
    let s = '';
    for (let i = 0; i <= idx && i < steps.length; i++) s += steps[i].out;
    if (idx === steps.length - 1) s += trace.tail;
    return s;
  }, [trace, idx, steps]);

  const fs = (n: number) => Math.round(n * zoom / 100);

  const panel: React.CSSProperties = {
    background: '#14121d', border: '1px solid #262336', borderRadius: 12, overflow: 'hidden',
  };
  const head: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
    background: '#1a1726', borderBottom: '1px solid #262336',
    fontSize: 12, fontWeight: 700, color: '#c9c3da',
  };

  return (
    <div style={embedded ? { borderRadius: 14, border: '1px solid #313244', background: '#0f0d17', overflow: 'hidden' } : { marginTop: 16, borderRadius: 16, border: '1px solid #e5e0ec', background: '#fff', overflow: 'hidden' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: embedded ? '8px 10px' : '10px 14px',
        background: embedded ? '#181825' : '#faf8fc', borderBottom: embedded ? '1px solid #313244' : '1px solid #e5e0ec',
        flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: embedded ? 12 : 13, fontWeight: 700, color: embedded ? '#c084fc' : '#5b21b6' }}>
          <Eye size={embedded ? 14 : 16} /> Visualizer
        </span>
        {!embedded && <span style={{ fontSize: 11.5, color: '#9891a6' }}>step-through execution · Python</span>}
        <div style={{ flex: 1 }} />
        {/* step controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button title="First step" onClick={() => { setPlaying(false); setIdx(0); }} disabled={!steps.length}
            style={ctlBtn}><SkipBack size={13} /></button>
          <button title="Previous" onClick={() => { setPlaying(false); setIdx(i => Math.max(0, i - 1)); }} disabled={!idx}
            style={ctlBtn}><ChevronLeft size={13} /></button>
          <button title={playing ? 'Pause' : 'Auto-play'} onClick={() => setPlaying(p => !p)} disabled={!steps.length}
            style={{ ...ctlBtn, background: '#7c3aed', color: '#fff', border: 'none' }}>
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button title="Next" onClick={() => { setPlaying(false); setIdx(i => Math.min(steps.length - 1, i + 1)); }} disabled={idx >= steps.length - 1}
            style={ctlBtn}><ChevronRight size={13} /></button>
          <button title="Last step" onClick={() => { setPlaying(false); setIdx(steps.length - 1); }} disabled={!steps.length}
            style={ctlBtn}><SkipForward size={13} /></button>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: embedded ? '#cdd6f4' : '#374151', minWidth: 80, textAlign: 'center' }}>
          {steps.length ? `${idx + 1} / ${steps.length}` : '—'}
        </span>
        {/* progress */}
        <div style={{ width: embedded ? 60 : 120, height: 5, borderRadius: 99, background: embedded ? '#313244' : '#e5e0ec', overflow: 'hidden' }}>
          <div style={{ width: `${steps.length ? ((idx + 1) / steps.length) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg,#22d3ee,#7c3aed)', transition: 'width .2s' }} />
        </div>
        {/* zoom (full mode only) */}
        {!embedded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button title="Zoom out" onClick={() => setZoom(z => Math.max(70, z - 10))} style={ctlBtn}><ZoomOut size={13} /></button>
            <span style={{ fontSize: 11.5, color: '#6b7280', minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button title="Zoom in" onClick={() => setZoom(z => Math.min(150, z + 10))} style={ctlBtn}><ZoomIn size={13} /></button>
          </div>
        )}
        <button title="Re-run trace" onClick={() => void run()} disabled={loading} style={ctlBtn}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
        </button>
        {onExpand && (
          <button title="Expand to fullscreen modal" onClick={onExpand} style={{ ...ctlBtn, color: '#7c3aed' }}>
            <Maximize2 size={13} />
          </button>
        )}
        {onExit && !embedded && (
          <button title="Close visualizer" onClick={onExit} style={{ ...ctlBtn, color: '#dc2626' }}><X size={14} /></button>
        )}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ padding: embedded ? 24 : 40, textAlign: 'center', color: '#9891a6', fontSize: 12.5 }}>
          <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px', color: '#a855f7' }} />
          Tracing execution…
        </div>
      ) : error ? (
        <div style={{ padding: embedded ? 16 : 24, display: 'flex', gap: 10, alignItems: 'flex-start', color: '#f87171', fontSize: 12 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: mono, fontSize: 11.5 }}>{error}</pre>
        </div>
      ) : !step ? (
        <div style={{ padding: embedded ? 24 : 40, textAlign: 'center', color: '#9891a6', fontSize: 12.5 }}>No steps captured.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: embedded ? 10 : 14, background: '#0f0d17' }}>
          {runError && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 8, background: '#2a1414', border: '1px solid #7f1d1d' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: '#fca5a5' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fecaca' }}>Stopped early:</div>
                <pre style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: mono, fontSize: 11, color: '#f87171' }}>{runError}</pre>
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: embedded ? '1fr' : 'minmax(0,5fr) minmax(0,6fr)', gap: 10 }}>
            {/* ── Code with active-line highlight ── */}
            <div style={panel}>
              <div style={head}><Terminal size={13} /> main.py</div>
              <div style={{ maxHeight: embedded ? 200 : 340, overflow: 'auto', padding: '8px 0' }}>
                {codeLines.map((ln, i) => {
                  const n = i + 1;
                  const active = n === step.line;
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 10, padding: '1px 12px 1px 0',
                      background: active ? 'rgba(34,197,94,.14)' : 'transparent',
                      borderLeft: active ? '3px solid #22c55e' : '3px solid transparent',
                    }}>
                      <span style={{ width: 34, textAlign: 'right', color: active ? '#22c55e' : '#4b465e', fontSize: fs(11.5), fontFamily: mono, flexShrink: 0, userSelect: 'none' }}>{n}</span>
                      <pre style={{ margin: 0, color: active ? '#e8ffe8' : '#c9c3da', fontSize: fs(12.5), fontFamily: mono, whiteSpace: 'pre', flex: 1 }}>{ln || ' '}</pre>
                      {active && <span style={{ color: '#22c55e', fontSize: fs(12), alignSelf: 'center' }}>◀</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Right: stdout + scopes ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div style={panel}>
                <div style={head}><Terminal size={13} /> Output</div>
                <pre style={{ margin: 0, padding: 12, minHeight: 64, maxHeight: 120, overflow: 'auto', color: '#e7e3f0', fontSize: fs(12.5), fontFamily: mono, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {stdoutSoFar || <span style={{ color: '#4b465e' }}>(no output yet)</span>}
                </pre>
              </div>

              <div style={panel}>
                <div style={head}><Boxes size={13} /> Variables &amp; Scopes</div>
                <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, maxHeight: 180, overflow: 'auto' }}>
                  {step.scopes.map((sc, si) => (
                    <div key={si} style={{ border: '1px dashed #3a3550', borderRadius: 8, padding: 8, minWidth: 150, background: '#171423' }}>
                      <div style={{ fontSize: fs(11), fontWeight: 700, color: sc.name === '<module>' ? '#e7e3f0' : '#22d3ee', marginBottom: 6, fontFamily: mono }}>
                        {sc.name === '<module>' ? 'Main Block' : `function ${sc.name}()`}
                      </div>
                      {Object.keys(sc.vars).length === 0 ? (
                        <span style={{ fontSize: fs(10.5), color: '#4b465e' }}>no variables</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {Object.entries(sc.vars).map(([k, v]) => (
                            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#221e33', border: '1px solid #322c47', borderRadius: 6, padding: '3px 7px', fontSize: fs(11), fontFamily: mono }}>
                              <span style={{ color: '#c4b5fd' }}>{k}</span>
                              <span style={{ color: '#7dd3fc' }}>{v}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Explanation ── */}
          <div style={panel}>
            <div style={head}><MessageSquareText size={13} /> Explanation of this step</div>
            <div style={{ padding: 12 }}>
              <pre style={{ margin: '0 0 8px', color: '#fca5a5', fontSize: fs(12), fontFamily: mono, whiteSpace: 'pre-wrap' }}>{codeLines[step.line - 1] || ''}</pre>
              <p style={{ margin: 0, color: '#e7e3f0', fontSize: fs(13), lineHeight: 1.5 }}>
                {explain(step, codeLines[step.line - 1] || '').split(/(`[^`]+`)/g).map((part, i) =>
                  part.startsWith('`') && part.endsWith('`')
                    ? <code key={i} style={{ background: '#221e33', border: '1px solid #322c47', borderRadius: 5, padding: '1px 6px', color: '#7dd3fc', fontFamily: mono, fontSize: fs(12) }}>{part.slice(1, -1)}</code>
                    : <span key={i}>{part}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ctlBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid #d9d2e6', background: '#fff',
  color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0,
};
