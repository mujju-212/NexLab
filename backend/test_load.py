"""
30-User Concurrent Load Test for Judge0
Simulates 30 students submitting code simultaneously.
Reports: success rate, response times, failures, throughput.
"""
import concurrent.futures
import time
import requests
import statistics
import base64
from dataclasses import dataclass, field
from typing import Optional

JUDGE0 = "http://localhost:2358"
TOTAL_USERS = 30
POLL_INTERVAL = 0.4   # seconds between polls
MAX_POLL_TIME = 30    # seconds before timeout

# ── Realistic student code samples (varied languages) ─────────────────────────
JOBS = [
    # Python (10 users)
    ("python", 71, 'import math\nresult = sum(i**2 for i in range(1,101))\nprint(f"Sum of squares 1-100 = {result}")', ""),
    ("python", 71, 'n = int(input())\nprint(sum(range(1, n+1)))', "50"),
    ("python", 71, 'def fib(n): return n if n<=1 else fib(n-1)+fib(n-2)\nprint([fib(i) for i in range(10)])', ""),
    ("python", 71, 'import math\nfor i in range(5): print(f"sqrt({i}) = {math.sqrt(i):.4f}")', ""),
    ("python", 71, 'words = ["hello","world","python","judge0"]\nfor w in words: print(w.upper())', ""),
    ("python", 71, 'matrix = [[i*j for j in range(1,4)] for i in range(1,4)]\nfor row in matrix: print(row)', ""),
    ("python", 71, 'primes = [x for x in range(2,50) if all(x%i!=0 for i in range(2,x))]\nprint("Primes:", primes)', ""),
    ("python", 71, 'd = {"a":1,"b":2,"c":3}\nfor k,v in d.items(): print(f"{k}={v}")', ""),
    ("python", 71, 'print("\\n".join(str(i**2) for i in range(1,8)))', ""),
    ("python", 71, 'import time\nt=time.time()\nprint(sum(range(100000)))\nprint(f"Time: {time.time()-t:.3f}s")', ""),

    # Java (8 users)
    ("java", 62, 'public class Main{public static void main(String[] a){int s=0;for(int i=1;i<=100;i++)s+=i;System.out.println("Sum="+s);}}', ""),
    ("java", 62, 'public class Main{public static void main(String[] a){System.out.println("Hello Java!");System.out.println(Runtime.getRuntime().maxMemory()/1024/1024+" MB");}}', ""),
    ("java", 62, 'public class Main{static int fib(int n){return n<=1?n:fib(n-1)+fib(n-2);}public static void main(String[] a){for(int i=0;i<10;i++)System.out.print(fib(i)+" ");System.out.println();}}', ""),
    ("java", 62, 'import java.util.*;public class Main{public static void main(String[] a){List<Integer> l=Arrays.asList(5,3,8,1,9);Collections.sort(l);System.out.println(l);}}', ""),
    ("java", 62, 'public class Main{public static void main(String[] a){String s="VirtualLab";System.out.println(s.length());System.out.println(s.toUpperCase());System.out.println(new StringBuilder(s).reverse());}}', ""),
    ("java", 62, 'public class Main{public static void main(String[] a){int[]arr={1,2,3,4,5};int sum=0;for(int x:arr)sum+=x;System.out.println("Array sum="+sum);}}', ""),
    ("java", 62, 'public class Main{public static void main(String[] a){for(int i=1;i<=5;i++){for(int j=1;j<=i;j++)System.out.print("* ");System.out.println();}}}', ""),
    ("java", 62, 'public class Main{public static void main(String[] a){double pi=Math.PI;System.out.printf("Pi=%.6f%n",pi);System.out.printf("e=%.6f%n",Math.E);}}', ""),

    # C++ (7 users)
    ("cpp", 54, '#include<iostream>\n#include<vector>\nusing namespace std;\nint main(){vector<int>v={3,1,4,1,5,9,2,6};sort(v.begin(),v.end());for(int x:v)cout<<x<<" ";cout<<endl;}', ""),
    ("cpp", 54, '#include<iostream>\nusing namespace std;\nint main(){int n=10,a=0,b=1;cout<<a<<" "<<b<<" ";for(int i=2;i<n;i++){int c=a+b;cout<<c<<" ";a=b;b=c;}cout<<endl;}', ""),
    ("cpp", 54, '#include<iostream>\n#include<cmath>\nusing namespace std;\nint main(){for(int i=1;i<=5;i++)printf("%.3f\\n",sqrt((double)i));}', ""),
    ("cpp", 54, '#include<iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<"Sum="<<a+b<<" Prod="<<a*b<<endl;}', "10 20"),
    ("cpp", 54, '#include<iostream>\n#include<string>\nusing namespace std;\nint main(){string s="VirtualLab";cout<<s<<" len="<<s.length()<<endl;reverse(s.begin(),s.end());cout<<s<<endl;}', ""),
    ("cpp", 54, '#include<iostream>\nusing namespace std;\nint main(){for(int i=1;i<=9;i++){for(int j=1;j<=9;j++)printf("%3d",i*j);printf("\\n");}}', ""),
    ("cpp", 54, '#include<iostream>\n#include<algorithm>\n#include<vector>\nusing namespace std;\nint main(){vector<int>v(10);generate(v.begin(),v.end(),[n=0]()mutable{return n++;});for(int x:v)cout<<x<<" ";cout<<endl;}', ""),

    # C (3 users)
    ("c", 49, '#include<stdio.h>\nint main(){int i,s=0;for(i=1;i<=100;i++)s+=i;printf("Sum=%d\\n",s);return 0;}', ""),
    ("c", 49, '#include<stdio.h>\n#include<math.h>\nint main(){int n;scanf("%d",&n);printf("sqrt(%d)=%.4f\\n",n,sqrt((double)n));return 0;}', "144"),
    ("c", 49, '#include<stdio.h>\nvoid swap(int*a,int*b){int t=*a;*a=*b;*b=t;}\nint main(){int x=5,y=10;swap(&x,&y);printf("x=%d y=%d\\n",x,y);return 0;}', ""),

    # JavaScript (2 users)
    ("javascript", 63, 'const arr=[1,2,3,4,5,6,7,8,9,10];\nconst evens=arr.filter(x=>x%2===0);\nconsole.log("Evens:",evens);\nconsole.log("Sum:",arr.reduce((a,b)=>a+b,0));', ""),
    ("javascript", 63, 'function fib(n){return n<=1?n:fib(n-1)+fib(n-2);}\nfor(let i=0;i<10;i++)process.stdout.write(fib(i)+" ");\nconsole.log();', ""),
]


@dataclass
class Result:
    user_id:    int
    language:   str
    success:    bool
    status:     str = ""
    stdout:     str = ""
    error:      str = ""
    submit_ms:  float = 0.0
    total_ms:   float = 0.0
    queue_ms:   float = 0.0


def b64d(s: Optional[str]) -> str:
    if not s: return ""
    try:    return base64.b64decode(s).decode("utf-8", errors="replace")
    except: return s


def run_one_user(user_id: int) -> Result:
    lang, lang_id, code, stdin = JOBS[user_id % len(JOBS)]
    res = Result(user_id=user_id, language=lang, success=False)
    t0 = time.perf_counter()

    try:
        # Submit
        t_submit = time.perf_counter()
        r = requests.post(f"{JUDGE0}/submissions?base64_encoded=true", json={
            "source_code": base64.b64encode(code.encode()).decode(),
            "language_id": lang_id,
            "stdin":       base64.b64encode(stdin.encode()).decode(),
        }, timeout=10)
        res.submit_ms = (time.perf_counter() - t_submit) * 1000

        if r.status_code not in (200, 201):
            res.error = f"Submit HTTP {r.status_code}: {r.text[:80]}"
            res.total_ms = (time.perf_counter() - t0) * 1000
            return res

        token = r.json().get("token")
        if not token:
            res.error = "No token returned"
            res.total_ms = (time.perf_counter() - t0) * 1000
            return res

        # Poll
        t_queue = time.perf_counter()
        deadline = time.perf_counter() + MAX_POLL_TIME
        while time.perf_counter() < deadline:
            time.sleep(POLL_INTERVAL)
            pr = requests.get(
                f"{JUDGE0}/submissions/{token}?base64_encoded=true&fields=status,stdout,stderr,compile_output,time,memory",
                timeout=10
            )
            if pr.status_code != 200:
                continue
            pd = pr.json()
            sid = (pd.get("status") or {}).get("id")
            if sid and sid not in (1, 2):
                res.queue_ms   = (time.perf_counter() - t_queue) * 1000
                res.total_ms   = (time.perf_counter() - t0) * 1000
                res.status     = (pd.get("status") or {}).get("description", "?")
                res.stdout     = b64d(pd.get("stdout"))
                res.success    = (sid == 3)
                if not res.success:
                    res.error  = b64d(pd.get("compile_output")) or b64d(pd.get("stderr"))
                return res

        res.error    = f"Timed out after {MAX_POLL_TIME}s"
        res.total_ms = (time.perf_counter() - t0) * 1000
        return res

    except Exception as e:
        res.error    = str(e)
        res.total_ms = (time.perf_counter() - t0) * 1000
        return res


def run_load_test():
    print(f"\n{'='*65}")
    print(f"  JUDGE0 LOAD TEST — {TOTAL_USERS} SIMULTANEOUS USERS")
    print(f"{'='*65}")
    print(f"  Target : {JUDGE0}")
    print(f"  Users  : {TOTAL_USERS} concurrent submissions")
    print(f"  Mix    : Python×10  Java×8  C++×7  C×3  JS×2")
    print(f"{'='*65}\n")
    print(f"  {'User':<6} {'Lang':<12} {'Status':<22} {'Total':>8}  {'Detail'}")
    print(f"  {'-'*62}")

    results = []
    wall_start = time.perf_counter()

    with concurrent.futures.ThreadPoolExecutor(max_workers=TOTAL_USERS) as pool:
        futures = {pool.submit(run_one_user, uid): uid for uid in range(TOTAL_USERS)}
        for fut in concurrent.futures.as_completed(futures):
            r = fut.result()
            results.append(r)
            ok_icon = "✅" if r.success else "❌"
            detail  = (r.stdout[:35].replace('\n',' ') if r.success else r.error[:35])
            print(f"  U{r.user_id:<5} {r.language:<12} {ok_icon} {r.status:<18} {r.total_ms:>7.0f}ms  {detail}")

    wall_ms = (time.perf_counter() - wall_start) * 1000

    # ── Stats ───────────────────────────────────────────────────────────────
    ok      = [r for r in results if r.success]
    failed  = [r for r in results if not r.success]
    times   = [r.total_ms for r in results]
    ok_times= [r.total_ms for r in ok]

    print(f"\n{'='*65}")
    print(f"  RESULTS SUMMARY")
    print(f"{'='*65}")
    print(f"  Total users tested : {TOTAL_USERS}")
    print(f"  ✅ Passed          : {len(ok)}/{TOTAL_USERS}  ({100*len(ok)/TOTAL_USERS:.0f}%)")
    print(f"  ❌ Failed          : {len(failed)}/{TOTAL_USERS}")
    print(f"  Wall-clock time    : {wall_ms/1000:.2f}s  (all {TOTAL_USERS} users, parallel)")
    print(f"  Throughput         : {len(ok)/(wall_ms/1000):.1f} jobs/sec")

    if times:
        print(f"\n  Response Time (all {TOTAL_USERS} users):")
        print(f"    Min    : {min(times):.0f}ms")
        print(f"    Median : {statistics.median(times):.0f}ms")
        print(f"    P95    : {sorted(times)[int(0.95*len(times))]:.0f}ms")
        print(f"    Max    : {max(times):.0f}ms")

    if failed:
        print(f"\n  ❌ Failures:")
        for r in failed:
            print(f"    U{r.user_id} ({r.language}): {r.error[:60]}")

    # Verdict
    print(f"\n{'='*65}")
    pass_pct = 100 * len(ok) / TOTAL_USERS
    if pass_pct == 100 and statistics.median(times) < 5000:
        print("  🎉 VERDICT: FULLY HANDLES 30 CONCURRENT USERS")
        print(f"     All jobs completed. Median response: {statistics.median(times):.0f}ms")
    elif pass_pct >= 90:
        print(f"  ⚠️  VERDICT: MOSTLY OK ({pass_pct:.0f}% pass) — minor queue pressure")
    else:
        print(f"  ❌ VERDICT: STRUGGLING ({pass_pct:.0f}% pass) — needs more workers")
    print(f"{'='*65}\n")


if __name__ == "__main__":
    run_load_test()
