# Virtual Lab — Experiment Logic Audit

Audit date: 2026-08-08. Scope: all 48 lab pages across 7 modules. Goal: verify the JavaScript inside each "Simulation" tab actually implements the algorithm/concept correctly, since students will treat these as ground truth.

## Headline result

The project splits sharply into two tiers:

- **Python Programming (basic + advanced), and most of OOP** are in solid shape — the simulations genuinely compute results from real logic, and the vast majority are correct.
- **AI, most of Data Structures, and half of Machine Learning** are largely **decorative** — the "Simulation" buttons play a scripted animation with hardcoded/canned numbers rather than actually running the algorithm. These will not hold up if an examiner changes an input or asks "why did that not change?" This is the biggest risk to the project before submission.

Also: **no lab has a working AI Socratic Assistant** in the real sense (it's keyword matching, not a model) — fine to keep, but don't call it "AI-powered" in your report without a caveat. **Quiz grading is entirely missing** in the AI module and the OOP module (buttons just `alert('Submitted!')`), so pre/post-test scores won't work there even though they work fine in Python and most ML labs.

---

## Priority 1 — Non-functional, must be rebuilt before demo

| Lab | Problem |
|---|---|
| **ML → PCA** | No PCA math at all (no covariance matrix, no eigen-decomposition, no projection). Also references a missing DOM element (`explanationText`), which throws a JS error and halts the page on click. Missing Post-Test and AI tabs entirely. |
| **ML → SVM** | Fully canned: hyperplane, margin, and support vectors are fixed numbers per dataset that don't respond to kernel or C. No real optimization. |
| **AI → all 6 labs** (Policy Iteration, Value Iteration, Q-Learning, DFS, Greedy Best-First Search, Minimax) | None implement their real algorithm. Value/Policy Iteration just nudge numbers with no Bellman equation; Q-Learning updates a table with a flat +0.1 and random (not ε-greedy) actions; DFS has no graph/stack, just walks a fixed array; Greedy BFS has no edges and never stops at the goal; Minimax hardcodes the backpropagated values instead of computing them recursively. None of the 6 have quiz grading — Submit just shows an alert. |
| **DS-1 → Graphs, Trees, Stacks/Queues, Linked List, Searching** (5 of 6 labs) | All are stub/`alert()` placeholders: BFS and DFS produce identical fixed output regardless of which is selected; "BST insert" just appends a DOM box with no comparison logic; Stacks/Queues has no Queue at all and no infix→postfix conversion despite being named; Linked List has no pointer model and no polynomial-addition logic; Searching's search and hashing buttons are bare `alert()` calls with zero implementation. |
| **DS-2 → Graphs, Search Tree, String** (3 of 4 labs) | Same pattern: Graphs ignores the selected algorithm (Topo Sort/MST/Dijkstra all look identical); Search Tree never implements 2-3/Red-Black logic; String lab's KMP and Trie buttons are bare `alert()` calls. |

That's **17 of 48 labs** that need real logic written, not just bug fixes.

---

## Priority 2 — Real logic, but with correctness bugs

| Lab | Bug | Fix |
|---|---|---|
| Python Basic → **Arithmetic Operations** | `%` uses JS truncated-remainder semantics, not Python's floored modulo (diverges for negative operands, e.g. `-7 % 3` should be `2`, shows `-1`). Also result "type" (int/float) is inferred from whether the number happens to be whole, not from real Python typing rules — contradicts the float literals shown just above it. | Use `((a % b) + b) % b` for modulus; track declared type from input format, not result value. |
| ML → **Data Preprocessing** | StandardScaler z-scores are hardcoded and off by ~10–20% from `(x-mean)/std` on the shown data. | Compute z-scores programmatically from the imputed array. |
| ML → **Linear Regression** | Final OLS answer is correct, but the 3 "gradient descent" intermediate steps are fake interpolations toward the answer, and their R² values are hardcoded, not recomputed. | Either run real GD iterations or relabel the steps as "illustrative," not GD. |
| ML → **Naive Bayes** | Laplace-smoothing slider is decorative for known vocabulary — changing α doesn't change the output for in-vocabulary words. | Recompute likelihoods with the real Laplace formula using the selected α. |
| ML → **Decision Tree** | One node has a 50/50 class split but entropy shown as 0.97 instead of the correct 1.0. | Fix the hardcoded value or recompute entropy from counts. |
| ML → **Random Forest** | Final banner always announces the same hardcoded class regardless of the actual tallied vote. | Derive the announced label from the real `majorityVote` variable. |
| ML → **K-Means** | Selecting "random init" on the 3-blobs dataset silently has no effect; the Elbow-curve chart is a fixed array unrelated to the real computed SSE. | Wire init strategy into centroid seeding; compute the elbow curve from real inertia per K. |
| DS-1 → **Sorting** | Merge sort's *animation* shows out-of-order intermediate states due to a shared mutable array across recursive calls, though the final sorted result is correct. | Low priority — cosmetic during animation only. |
| OOP → **Encapsulation** | Procedure tab promises showing "access denied" on a private attribute, but the simulation always shows "Access Granted." | Add a second control path that shows the real AttributeError/access-denied case. |
| OOP → **Abstraction** | Procedure tab promises showing an error when instantiating an abstract class, but there's no control to trigger that; only the working concrete-class path exists. | Add an "instantiate abstract class" button that shows the real `TypeError`. |
| OOP → **Static Members** | Only shows one counter incrementing; never creates a second instance to prove the value is *shared* rather than per-object, which is the entire point of the lesson. | Add a "create instance" control and render 2+ instance cards all reflecting the same shared value. |

---

## Priority 3 — Minor / cosmetic (safe to leave, but easy one-line fixes)

- Python Advanced → Higher Order Functions: `reduce()` step explanation calls a generic cumulative product a "factorial" — only true because the sample input happens to be `[1,2,3,4,5]`. Reword to avoid over-generalizing.
- Python Basic → File Operators: says "Written 20 bytes" for a 19-byte string — flavor text, not a Python semantics bug.
- Python Basic → Built-in Modules: `datetime` example hardcodes a static date rather than truly calling "today" — fine for a demo, just not literally live.
- KNN's neighbor-radius circle is drawn slightly out of proportion (doesn't affect the actual vote/classification result).

---

## Clean / no issues found

Python Basic: Built-in Functions, Built-in Modules, Classes & Objects, Constructors & Inheritance, Data Types, Loops, Strings (7/9).
Python Advanced: Complex Datatypes, Lambda Functions, Extended Formal Argument Syntax, Exception Handling (4/5).
ML: Logistic Regression, KNN (core logic correct, minor cosmetic notes only).
DS-2: Sorting.
OOP: Class & Object, Constructors, Inheritance, both Polymorphism labs.

---

## Recommendation for "real-time working for students"

Given you want this genuinely usable by students, not just visually convincing to a grader, the honest scope is:

1. **Rebuild 17 stub labs** (all 6 AI labs, 8 of 10 non-sorting Data Structures labs, PCA, SVM) with actual computation behind the animation. This is the largest chunk of remaining work.
2. **Add quiz grading** to the AI and OOP modules (currently just `alert('Submitted!')`).
3. **Fix the 11 correctness bugs** in Priority 2 — these are quick, targeted patches in existing working code.
4. Optionally polish the Priority 3 wording issues.

I can start on any of these — happy to prioritize by what's most visible in your demo (e.g., if examiners will specifically click through AI or DSA labs, start there) or work module by module. Let me know where to begin.
