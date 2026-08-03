'use client';

import { useState, useRef } from 'react';
import { Camera, Mic, Globe, CheckCircle2, Radio, User, Users, Clock, PlayCircle, Sparkles, Code2, Terminal, HelpCircle } from 'lucide-react';
import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

const SESSION = {
  title: 'Organic Chemistry: Titration Lab',
  instructor: 'Dr. Ramesh',
  section: 'CS — Section A',
  duration: '90 min',
  students: 28,
  time: '10:00 AM – 11:30 AM',
};

const STARTER_CODES: Record<string, string> = {
  python: `# Titration Lab — Python Simulation
# Calculate moles and concentration

def calculate_molarity(moles, volume_L):
    """Molarity = moles of solute / volume of solution (L)"""
    if volume_L == 0:
        return 0
    return moles / volume_L

def find_equivalence_point(acid_volume_mL, acid_molarity, base_molarity):
    """At equivalence: moles_acid = moles_base"""
    moles_acid = acid_molarity * (acid_volume_mL / 1000)
    volume_base_L = moles_acid / base_molarity
    return volume_base_L * 1000  # convert to mL

# Experiment Data
acid_volume = 25.0    # mL of HCl
acid_molarity = 0.1   # mol/L
base_molarity = 0.1   # NaOH concentration

# Run calculations
moles_acid = acid_molarity * (acid_volume / 1000)
vol_base = find_equivalence_point(acid_volume, acid_molarity, base_molarity)

print(f"Acid: {acid_volume} mL of {acid_molarity}M HCl")
print(f"Moles of acid: {moles_acid:.4f} mol")
print(f"Volume of NaOH needed: {vol_base:.2f} mL")
print(f"Equivalence point reached at {vol_base:.2f} mL of base")
print("\\nStatus: Experiment Complete ✅")
`,
  javascript: `// Titration Lab — JavaScript Simulation

function calculateMolarity(moles, volumeL) {
  if (volumeL === 0) return 0;
  return moles / volumeL;
}

function findEquivalencePoint(acidVolumeML, acidMolarity, baseMolarity) {
  const molesAcid = acidMolarity * (acidVolumeML / 1000);
  const volumeBaseL = molesAcid / baseMolarity;
  return volumeBaseL * 1000; // convert to mL
}

// Experiment Data
const acidVolume = 25.0;    // mL
const acidMolarity = 0.1;   // mol/L
const baseMolarity = 0.1;   // mol/L

const molesAcid = acidMolarity * (acidVolume / 1000);
const volBase = findEquivalencePoint(acidVolume, acidMolarity, baseMolarity);

console.log(\`Acid: \${acidVolume} mL of \${acidMolarity}M HCl\`);
console.log(\`Moles of acid: \${molesAcid.toFixed(4)} mol\`);
console.log(\`Volume of NaOH needed: \${volBase.toFixed(2)} mL\`);
console.log("Status: Experiment Complete ✅");
`,
  c: `#include <stdio.h>

float calculateMolarity(float moles, float volumeL) {
    if (volumeL == 0) return 0;
    return moles / volumeL;
}

float findEquivalencePoint(float acidVolumeML, float acidMolarity, float baseMolarity) {
    float molesAcid = acidMolarity * (acidVolumeML / 1000.0f);
    float volumeBaseL = molesAcid / baseMolarity;
    return volumeBaseL * 1000.0f;
}

int main() {
    float acidVolume = 25.0f;
    float acidMolarity = 0.1f;
    float baseMolarity = 0.1f;

    float molesAcid = acidMolarity * (acidVolume / 1000.0f);
    float volBase = findEquivalencePoint(acidVolume, acidMolarity, baseMolarity);

    printf("Acid: %.1f mL of %.1fM HCl\\n", acidVolume, acidMolarity);
    printf("Moles of acid: %.4f mol\\n", molesAcid);
    printf("Volume of NaOH needed: %.2f mL\\n", volBase);
    printf("Status: Experiment Complete\\n");
    return 0;
}`,
};

const MOCK_OUTPUTS: Record<string, string> = {
  python: `Acid: 25.0 mL of 0.1M HCl
Moles of acid: 0.0025 mol
Volume of NaOH needed: 25.00 mL
Equivalence point reached at 25.00 mL of base

Status: Experiment Complete ✅

>>> Process finished with exit code 0
>>> Execution time: 0.042s | Memory: 8.2 MB`,
  javascript: `Acid: 25.0 mL of 0.1M HCl
Moles of acid: 0.0025 mol
Volume of NaOH needed: 25.00 mL
Status: Experiment Complete ✅

>>> Process finished with exit code 0
>>> Execution time: 0.018s | Memory: 5.1 MB`,
  c: `Acid: 25.0 mL of 0.1M HCl
Moles of acid: 0.0025 mol
Volume of NaOH needed: 25.00 mL
Status: Experiment Complete

>>> Process finished with exit code 0
>>> Execution time: 0.005s | Memory: 1.2 MB`,
};

const AI_HINTS = [
  "💡 Molarity (M) = moles of solute ÷ volume of solution in liters. Check your unit conversions — mL to L!",
  "🔬 At the equivalence point, moles of acid = moles of base. Use this to find the unknown concentration.",
  "📊 Try modifying the acid_molarity value and observe how the required volume of base changes.",
  "⚗️ In a real titration, phenolphthalein turns pink at the equivalence point (pH ~8.2).",
  "🧮 Henderson-Hasselbalch equation: pH = pKa + log([A⁻]/[HA]) — useful for buffer calculations!",
];

export default function LiveLabPage() {
  const [joined, setJoined] = useState(false);
  const [checks, setChecks] = useState({ camera: false, mic: false, browser: false });
  const [allChecked, setAllChecked] = useState(false);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(STARTER_CODES.python);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'instructions' | 'output' | 'ai'>('instructions');
  const [hintIdx, setHintIdx] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const [attended, setAttended] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runCheck = (key: keyof typeof checks) => {
    setTimeout(() => {
      setChecks(c => {
        const next = { ...c, [key]: true };
        if (next.camera && next.mic && next.browser) setAllChecked(true);
        return next;
      });
    }, 800);
  };

  const runCode = () => {
    setRunning(true);
    setOutput('');
    setActiveTab('output');
    setTimeout(() => {
      setOutput(MOCK_OUTPUTS[language]);
      setRunning(false);
    }, 1500);
  };

  const getHint = () => {
    setHintLoading(true);
    setActiveTab('ai');
    setTimeout(() => {
      setHintIdx(i => (i + 1) % AI_HINTS.length);
      setHintLoading(false);
    }, 900);
  };

  const handleLangChange = (lang: string) => {
    setLanguage(lang);
    setCode(STARTER_CODES[lang]);
    setOutput('');
  };

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = code.substring(0, start) + '    ' + code.substring(end);
      setCode(newVal);
      setTimeout(() => { el.selectionStart = el.selectionEnd = start + 4; }, 0);
    }
  };

  if (!joined) {
    return (
      <StudentShell activePage="Join Lab" title="Live Lab Session" subtitle="Complete pre-checks to join the session">
        <div className={styles.joinFlow}>
          {/* Session Info Banner */}
          <div className={styles.sessionCard}>
            <div className={styles.sessionBadge}>
              <Radio size={14} /> LIVE
            </div>
            <h2 className={styles.sessionTitle}>{SESSION.title}</h2>
            <div className={styles.sessionMeta}>
              <span><User size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {SESSION.instructor}</span>
              <span><Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {SESSION.section}</span>
              <span><Clock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {SESSION.duration}</span>
              <span>🕒 {SESSION.time}</span>
              <span>👥 {SESSION.students} students</span>
            </div>
          </div>

          {/* Pre-Checks */}
          <h3 className={styles.checksTitle}>Required Pre-Checks</h3>
          <div className={styles.checksGrid}>
            {[
              { key: 'camera', label: 'Camera Check', desc: 'Verify your camera is working', Icon: Camera },
              { key: 'mic',    label: 'Microphone Check', desc: 'Test your audio levels', Icon: Mic },
              { key: 'browser', label: 'Browser Check', desc: 'Verify browser permissions', Icon: Globe },
            ].map(({ key, label, desc, Icon }) => (
              <div key={key} className={`${styles.checkCard} ${checks[key as keyof typeof checks] ? styles.checkDone : ''}`}>
                <div className={styles.checkIconWrapper}>
                  <Icon size={22} strokeWidth={2} className={styles.checkLucideIcon} />
                </div>
                <div className={styles.checkInfo}>
                  <p className={styles.checkLabel}>{label}</p>
                  <p className={styles.checkDesc}>{desc}</p>
                </div>
                {checks[key as keyof typeof checks] ? (
                  <span className={styles.checkPass}><CheckCircle2 size={14} /> Ready</span>
                ) : (
                  <button className={styles.checkBtn} onClick={() => runCheck(key as keyof typeof checks)}>
                    Test
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            className={`${styles.joinBtn} ${!allChecked ? styles.joinBtnDisabled : ''}`}
            disabled={!allChecked}
            onClick={() => setJoined(true)}
          >
            {allChecked ? '🚀 Join Lab Session' : `Complete all checks to join (${Object.values(checks).filter(Boolean).length}/3)`}
          </button>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell activePage="Live Coding Lab">
      <div className={styles.labLayout}>

        {/* ── Top Bar ── */}
        <div className={styles.labTopBar}>
          <div className={styles.sessionInfo}>
            <span className={styles.livePill}><Radio size={12} /> LIVE</span>
            <span className={styles.sessionName}>{SESSION.title}</span>
            <span className={styles.sessionInstructor}>· {SESSION.instructor}</span>
          </div>
          <div className={styles.labActions}>
            {!attended && (
              <button className={styles.attendBtn} onClick={() => setAttended(true)}>
                ✋ Mark Attendance
              </button>
            )}
            {attended && <span className={styles.attendedPill}>✅ Attendance Marked</span>}
            <button className={styles.hintBtn} onClick={getHint}>
              <Sparkles size={14} /> AI Hint
            </button>
            <div className={styles.langSelect}>
              {['python', 'javascript', 'c'].map(lang => (
                <button
                  key={lang}
                  className={`${styles.langBtn} ${language === lang ? styles.langActive : ''}`}
                  onClick={() => handleLangChange(lang)}
                >
                  {lang === 'python' ? 'Python' : lang === 'javascript' ? 'JS' : 'C'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Split Layout ── */}
        <div className={styles.splitLayout}>

          {/* Left: Instructions + Output + AI */}
          <div className={styles.leftPane}>
            <div className={styles.paneTabs}>
              {(['instructions', 'output', 'ai'] as const).map(t => (
                <button
                  key={t}
                  className={`${styles.paneTab} ${activeTab === t ? styles.paneTabActive : ''}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t === 'instructions' ? 'Instructions' : t === 'output' ? 'Output' : 'AI Hints'}
                  {t === 'output' && output && <span className={styles.tabDot} />}
                </button>
              ))}
            </div>

            <div className={styles.paneContent}>
              {activeTab === 'instructions' && (
                <div className={styles.instructions}>
                  <h3 className={styles.instrTitle}>{SESSION.title}</h3>
                  <div className={styles.instrObjective}>
                    <strong>🎯 Objective</strong>
                    <p>Calculate the molarity of an unknown acid solution using titration data and verify the equivalence point.</p>
                  </div>
                  <div className={styles.instrSteps}>
                    <strong>📝 Steps</strong>
                    <ol>
                      <li>Read the <code>calculate_molarity()</code> function and understand its parameters</li>
                      <li>Call <code>find_equivalence_point()</code> with your acid data</li>
                      <li>Print the moles of acid and volume of base required</li>
                      <li>Modify the code to try different acid concentrations</li>
                      <li>Run the code and verify the equivalence point calculation</li>
                    </ol>
                  </div>
                  <div className={styles.instrNote}>
                    <strong>⚠️ Note:</strong> At the equivalence point, moles of acid = moles of base. This is the key relationship in acid-base titration.
                  </div>
                  <div className={styles.testCases}>
                    <strong>🧪 Visible Test Cases</strong>
                    <div className={styles.testCase}>
                      <span className={styles.testInput}>Input: acid=25mL, acid_M=0.1, base_M=0.1</span>
                      <span className={styles.testOutput}>Expected: 25.00 mL NaOH</span>
                    </div>
                    <div className={styles.testCase}>
                      <span className={styles.testInput}>Input: acid=50mL, acid_M=0.2, base_M=0.1</span>
                      <span className={styles.testOutput}>Expected: 100.00 mL NaOH</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'output' && (
                <div className={styles.outputPane}>
                  {running ? (
                    <div className={styles.outputRunning}>
                      <div className={styles.outputSpinner} />
                      <span>Executing code...</span>
                    </div>
                  ) : output ? (
                    <pre className={styles.outputText}>{output}</pre>
                  ) : (
                    <div className={styles.outputEmpty}>
                      <span>▶ Run your code to see output here</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'ai' && (
                <div className={styles.aiPane}>
                  <div className={styles.aiHeader}>
                    <Sparkles size={28} style={{ color: '#7c3aed' }} />
                    <div>
                      <p className={styles.aiTitle}>AI Lab Assistant</p>
                      <p className={styles.aiSub}>Powered by Groq AI</p>
                    </div>
                  </div>
                  {hintLoading ? (
                    <div className={styles.hintLoading}>
                      <div className={styles.hintSpinner} />
                      <span>Generating hint...</span>
                    </div>
                  ) : (
                    <div className={styles.hintBubble}>
                      <p>{AI_HINTS[hintIdx]}</p>
                    </div>
                  )}
                  <button className={styles.newHintBtn} onClick={getHint}>
                    ✨ Get Another Hint
                  </button>
                  <div className={styles.conceptCards}>
                    <strong className={styles.conceptTitle}>Quick Concepts</strong>
                    {[
                      { term: 'Molarity', def: 'Moles of solute per litre of solution' },
                      { term: 'Equivalence', def: 'Point where acid and base moles are equal' },
                      { term: 'Indicator', def: 'Substance that changes colour at endpoint' },
                    ].map(c => (
                      <div key={c.term} className={styles.conceptCard}>
                        <strong>{c.term}</strong>
                        <span>{c.def}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Code Editor */}
          <div className={styles.rightPane}>
            <div className={styles.editorWrapper}>
              <div className={styles.editorBar}>
                <div className={styles.editorDots}>
                  <span style={{ background: '#ef4444' }} />
                  <span style={{ background: '#f59e0b' }} />
                  <span style={{ background: '#22c55e' }} />
                </div>
                <span className={styles.editorFilename}>
                  {language === 'python' ? 'lab.py' : language === 'javascript' ? 'lab.js' : 'lab.c'}
                </span>
                <span className={styles.editorLang}>{language.toUpperCase()}</span>
              </div>

              <div className={styles.editorArea}>
                <div className={styles.lineNums}>
                  {code.split('\n').map((_, i) => (
                    <div key={i} className={styles.lineNum}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  className={styles.editor}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={handleTab}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                />
              </div>

              <div className={styles.editorFooter}>
                <div className={styles.editorStats}>
                  <span>Lines: {code.split('\n').length}</span>
                  <span>Chars: {code.length}</span>
                </div>
                <div className={styles.editorBtns}>
                  <button className={styles.clearCodeBtn} onClick={() => setCode('')}>Clear</button>
                  <button className={styles.resetBtn} onClick={() => setCode(STARTER_CODES[language])}>Reset</button>
                  <button className={styles.runBtn} onClick={runCode} disabled={running}>
                    {running ? <><span className={styles.runSpinner}/> Running...</> : <>▶ Run Code</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
