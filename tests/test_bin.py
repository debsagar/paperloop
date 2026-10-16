"""Self-checks for the deterministic scripts in bin/. Run: python3 tests/test_bin.py"""
import json, os, subprocess, sys, tempfile

BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin")


def run(name, *args, cwd=None):
    r = subprocess.run([sys.executable, os.path.join(BIN, name), *args], capture_output=True, text=True, cwd=cwd)
    return r.returncode, r.stdout + r.stderr


PAPER = r"""\documentclass{article}
\usepackage[margin=1in]{geometry}
\begin{document}
We ran 200 episodes (2026). Accuracy rose from .444 to 0.61 (n=24, 95\% CI [0.52, 0.70]); a 12.5\% gain.
See Table~\ref{t1} and \cite{smith2020}. \vspace{3pt}
\begin{table}\label{t1}\end{table}
\bibliography{refs}
\end{document}
"""
BIB = "@article{smith2020,\n author = {Smith, Jane and Doe, John},\n title = {A title},\n year = {2020},\n}\n"
REG = {"numbers": [{"value": 200}, {"value": 0.4441}, {"value": 0.6089}, {"value": 0.95}, {"value": 0.52}, {"value": 0.70}, {"value": 0.125}, {"value": 24}]}


def test_numbers():
    with tempfile.TemporaryDirectory() as d:
        p, r = os.path.join(d, "p.tex"), os.path.join(d, "r.json")
        open(p, "w").write(PAPER); json.dump(REG, open(r, "w"))
        code, out = run("paperloop-numbers", p, "--registry", r)
        assert code == 0, out                                   # all traced
        open(p, "w").write(PAPER.replace("0.61", "0.67"))
        code, out = run("paperloop-numbers", p, "--registry", r)
        assert code == 1 and "0.67" in out, out                 # planted wrong number caught
        open(p, "w").write("\\begin{document}No numbers at all here.\\end{document}")
        code, out = run("paperloop-numbers", p, "--registry", r)
        assert code == 2 and "NOTHING_FOUND" in out, out        # fails on nothing
        o = os.path.join(d, "o.tex"); open(o, "w").write(PAPER.replace("0.61", "0.67"))
        open(p, "w").write(PAPER.replace("0.61", "0.67"))
        code, out = run("paperloop-numbers", p, "--registry", r, "--original", o)
        assert code == 0, out                                   # revision mode: number from original allowed


def test_validate():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "p.tex")
        open(p, "w").write(PAPER); open(os.path.join(d, "refs.bib"), "w").write(BIB)
        code, out = run("paperloop-validate", p)
        assert code == 0, out
        open(p, "w").write(PAPER.replace("smith2020", "nobody1999") + "")
        code, out = run("paperloop-validate", p)
        assert code == 1 and "nobody1999" in out, out           # missing cite key
        open(p, "w").write(PAPER.replace("Accuracy", "The log does not state accuracy"))
        code, out = run("paperloop-validate", p)
        assert code == 1 and "banned" in out, out               # bookkeeping leak
        open(os.path.join(d, "refs.bib"), "w").write(BIB.replace("Smith, Jane and Doe, John", "Smith and Doe"))
        open(p, "w").write(PAPER)
        code, out = run("paperloop-validate", p)
        assert code == 0 and "surname-only" in out, out         # soft warning only
        code, out = run("paperloop-validate", p, "--baseline-words", "200")
        assert code == 1 and "length" in out, out               # length gate


def test_snapshot():
    with tempfile.TemporaryDirectory() as d:
        paper = os.path.join(d, "paper"); os.makedirs(os.path.join(paper, "figures"))
        open(os.path.join(paper, "main.tex"), "w").write(PAPER)
        open(os.path.join(paper, "figures", "f.pdf"), "wb").write(b"%PDF-1.4 fake")
        root = os.path.join(d, ".paperloop")
        assert run("paperloop-snapshot", "save", paper, "it0", "--root", root)[0] == 0
        open(os.path.join(paper, "main.tex"), "w").write("changed")
        open(os.path.join(paper, "new.tex"), "w").write("new file")
        assert run("paperloop-snapshot", "verify", paper, "it0", "--root", root)[0] == 1
        code, out = run("paperloop-snapshot", "restore", paper, "it0", "--root", root)
        assert code == 0 and "byte-identical" in out, out
        assert open(os.path.join(paper, "main.tex")).read() == PAPER
        assert not os.path.exists(os.path.join(paper, "new.tex"))


def test_log():
    with tempfile.TemporaryDirectory() as d:
        log = os.path.join(d, "runs.jsonl")
        code, out = run("paperloop-log", "complaint", json.dumps({"run_id": "r", "paper_id": "p"}), "--log", log)
        assert code != 0 and "missing" in out, out
        rec = {"run_id": "r", "paper_id": "p", "cid": "c1", "k": 1, "persona_id": "skim", "section": "abstract",
               "quote": "q", "final_label": "presentation", "resolution": "resolved"}
        assert run("paperloop-log", "complaint", json.dumps(rec), "--log", log)[0] == 0
        bad = [{**rec, "event": "complaint"}, {"event": "edit", "run_id": "r", "paper_id": "p"}]
        assert run("paperloop-log", "batch", json.dumps(bad), "--log", log)[0] != 0   # all-or-nothing
        code, out = run("paperloop-log", "summary", "--log", log)
        assert '"presentation": 1' in out, out


def test_aitells():
    human = r"""\begin{document}\begin{abstract}We train a model on images and report its accuracy.\end{abstract}
\section{Intro} We trained the network for ten epochs on the training split and measured accuracy on held-out data.
The deeper models were harder to optimise, which motivated the residual connections described below.
We compare against two baselines from earlier work and report standard errors over five seeds.\end{document}"""
    machine = human.replace("We trained the network", "The answer is simple: we trained the network").replace(
        "The deeper models were harder", "The lesson is clear: depth is not the problem, but optimisation is. The deeper models were harder").replace(
        "We compare against", "Why does this matter? It matters because we compare against")
    with tempfile.TemporaryDirectory() as d:
        h, m = os.path.join(d, "h.tex"), os.path.join(d, "m.tex")
        open(h, "w").write(human); open(m, "w").write(machine)
        code, out = run("paperloop-aitells", m, "--baseline", h)
        assert code == 1 and "baseline" in out, out             # revision that adds tells fails
        assert run("paperloop-aitells", h, "--baseline", h)[0] == 0
        assert run("paperloop-aitells", h, "--max-score", "5")[0] == 0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok", name)
    print("all bin checks passed")
