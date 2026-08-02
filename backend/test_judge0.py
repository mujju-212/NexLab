import requests, base64, time

def b64d(s):
    if not s: return ''
    try: return base64.b64decode(s).decode('utf-8')
    except: return s

def run_one(label, lang_id, code, stdin=''):
    """Submit and wait inline — no queue congestion."""
    r = requests.post('http://localhost:2358/submissions?wait=true',
        json={"source_code": code, "language_id": lang_id, "stdin": stdin},
        timeout=60)
    if r.status_code not in (200, 201):
        return None, f"HTTP {r.status_code}"
    d = r.json()
    sid  = (d.get('status') or {}).get('id')
    out  = b64d(d.get('stdout'))
    err  = (b64d(d.get('stderr')) or b64d(d.get('compile_output')) or '').strip()
    return sid, out.strip() if sid == 3 else err

tests = [
    ("🐍 Python 3",       71, "print('Hello Python!'); print(2**10)", ""),
    ("🐍 Python stdin",   71, "n=int(input()); print(f'Sum 1-{n}=',sum(range(n+1)))", "100"),
    ("🐍 Python unicode", 71, "print(''.join(['█' if i%3!=2 else '░' for i in range(21)]))\nprint('Unicode ✅')", ""),
    ("⚙️  C (GCC)",        49, '#include<stdio.h>\nint main(){printf("C OK! %d\\n",42);return 0;}', ""),
    ("🔵 C++ 17",          54, '#include<iostream>\nusing namespace std;\nint main(){cout<<"C++ ✅ "<<2+2<<endl;}', ""),
    ("☕ Java 13",         62, 'public class Main{\n  public static void main(String[] a){\n    System.out.println("Java ✅ Works!");\n    System.out.println("JVM mem: "+Runtime.getRuntime().maxMemory()/1024/1024+" MB");\n  }\n}', ""),
    ("🟨 JavaScript",      63, 'const a=[1,2,3,4,5];\nconsole.log("JS ✅ Sum =",a.reduce((s,x)=>s+x,0));', ""),
    ("📊 R",               80, 'cat("R ✅\\n"); cat("Sum:",sum(1:10),"\\n")', ""),
    ("📐 Octave",          66, "printf('Octave ✅ Sum=%d\\n', sum(1:5));", ""),
]

print(f"\n{'='*65}")
print("  JUDGE0 FULL TEST — sequential (no queue congestion)")
print(f"{'='*65}")
print(f"\n{'Language':<22} {'Result':<16} {'Output'}")
print("─" * 65)

results = {}
for label, lid, code, stdin in tests:
    t0 = time.time()
    sid, out = run_one(label, lid, code, stdin)
    elapsed = time.time() - t0
    ok = sid == 3
    icon = "✅ Accepted" if ok else f"❌ id={sid}"
    preview = (out or '(empty)')[:35].replace('\n', ' ')
    print(f"{label:<22} {icon:<16} {preview}  [{elapsed:.1f}s]")
    results[label] = ok

print("\n" + "─" * 65)
passed = sum(v for v in results.values())
total  = len(results)
print(f"\n  TOTAL: {passed}/{total} languages PASSING")
if passed == total:
    print("  🎉 ALL LANGUAGES FULLY OPERATIONAL!")
    print("  Judge0 is production-ready for the Virtual Lab Platform.")
else:
    for k, v in results.items():
        if not v:
            print(f"  ❌ {k}")
print(f"{'='*65}\n")
