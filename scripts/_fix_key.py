from pathlib import Path
import re
p = Path(r"C:\fitness_prog\frontend\src\features\workout\pages\ActiveWorkout.tsx")
t = p.read_text(encoding="utf-8")
# replacement with real template literal
repl = "              key={`set-modal-${currentExercise.id}-${editingSetNumber ?? \"new\"}`}"
t2, n = re.subn(r"^[ \t]*key=\{.*\}$", repl, t, count=1, flags=re.M)
# only the set-modal one
if "set-modal" not in t2[t2.find("AddSetModal"):t2.find("AddSetModal")+200]:
    # more targeted
    lines = t.splitlines(True)
    out=[]
    done=False
    for line in lines:
        if (not done) and "key={" in line and "AddSetModal" in "".join(out[-5:]):
            out.append(repl + "\n")
            done=True
        elif (not done) and "set-modal" in line:
            out.append(repl + "\n")
            done=True
        else:
            out.append(line)
    t2="".join(out)
    n = 1 if done else 0
print("n", n)
# verify
for i,l in enumerate(t2.splitlines()):
    if "set-modal" in l:
        print(i+1, repr(l))
p.write_text(t2, encoding="utf-8")
