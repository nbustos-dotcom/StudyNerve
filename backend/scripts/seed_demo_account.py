"""
Seed a clean, populated demo account for marketing screenshots.

Runs against the LOCAL backend (defaults to SQLite + Ollama per app/config.py).
Calls the real backend SERVICES (extract_topics, generate_questions,
generate_insights) — NOT the HTTP endpoints — so per-user quota caps in
app/services/quota.py do not apply.

Idempotent: if the demo user exists it is wiped (along with every dependent
row) before re-seeding. Safe to re-run.

Run from repo root:
    python backend/scripts/seed_demo_account.py

It will be SLOW on Ollama (30–90 s per LLM call × ~25 calls). That's expected
for a one-time seed.
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from pathlib import Path

import bcrypt
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Resolve backend/ on sys.path so `from app...` works regardless of cwd.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.database import AsyncSessionLocal, init_db  # noqa: E402
from app.llm import extract_topics, generate_questions  # noqa: E402
from app.models import (  # noqa: E402
    Attempt,
    ChatMessage,
    Flashcard,
    Note,
    Question,
    QuizResult,
    StudentInsight,
    StudySession,
    Topic,
    UsageCounter,
    User,
    UserSettings,
)
from app.services.memory import generate_insights  # noqa: E402


# ═════════════════════════════════════════════════════════════════════════════
# CONFIG — tweak these for the demo
# ═════════════════════════════════════════════════════════════════════════════

DEMO_EMAIL = "demo@studynerve.app"
DEMO_NAME = "Jordan Lee"
DEMO_PASSWORD = "demodemo123"

QUESTIONS_PER_QUIZ = 4           # MCQs generated per quiz call
NOTES_QUIZZED_PER_SUBJECT = 2    # how many of each subject's notes get a quiz

# Subject definitions. `accuracy` is the target hit-rate for that subject's
# attempts — drives the gap detector so some clusters look strong and others
# look weak in the AI Brain.
#
# NOTE: `subject` is written verbatim (we bypass app.services.subjects.
# normalize_subject which would collapse "Calculus II" → "Mathematics" etc.).
# These four labels are what appear as AI Brain cluster names.

SUBJECTS: list[dict] = [
    {
        "name": "Biology",
        "accuracy": 0.80,
        "notes": [
            {
                "title": "Cell Membrane and Transport",
                "content": (
                    "The cell membrane is a phospholipid bilayer that separates the "
                    "interior of a cell from its external environment. Each phospholipid "
                    "has a hydrophilic phosphate head and two hydrophobic fatty-acid "
                    "tails, which together create a selectively permeable barrier. "
                    "Embedded in the bilayer are integral and peripheral proteins that "
                    "function as channels, pumps, receptors, and identity markers.\n\n"
                    "Transport across the membrane falls into two broad categories. "
                    "Passive transport — including simple diffusion, facilitated "
                    "diffusion through channel and carrier proteins, and osmosis — "
                    "requires no ATP and moves substances down their concentration "
                    "gradient. Active transport requires ATP and moves substances "
                    "against their gradient; the sodium–potassium pump is a textbook "
                    "example, exchanging three Na+ out for two K+ in per ATP "
                    "hydrolysed.\n\n"
                    "Bulk transport handles large molecules. Endocytosis (phagocytosis, "
                    "pinocytosis, and receptor-mediated) brings material into the cell "
                    "in vesicles formed from the membrane. Exocytosis fuses internal "
                    "vesicles with the membrane to release contents — the mechanism "
                    "neurons use to release neurotransmitters at the synapse."
                ),
            },
            {
                "title": "DNA Replication",
                "content": (
                    "DNA replication is semi-conservative: each new double helix "
                    "consists of one original parental strand and one newly synthesised "
                    "strand. The process begins at origins of replication, where "
                    "helicase unwinds the double helix and single-strand binding "
                    "proteins prevent the strands from re-annealing.\n\n"
                    "Topoisomerase relieves the supercoiling tension created ahead of "
                    "the replication fork. Primase lays down short RNA primers that "
                    "give DNA polymerase III a 3'-OH to extend from. DNA polymerase "
                    "synthesises only in the 5'→3' direction, which creates a leading "
                    "strand that is built continuously and a lagging strand built "
                    "discontinuously as Okazaki fragments.\n\n"
                    "DNA polymerase I removes the RNA primers and fills the resulting "
                    "gaps with DNA. DNA ligase seals the remaining nicks between "
                    "Okazaki fragments, producing a continuous strand. The combined "
                    "proofreading activity of DNA polymerase and the mismatch-repair "
                    "machinery gives replication an error rate of roughly one mistake "
                    "per billion base pairs."
                ),
            },
            {
                "title": "Mitosis and Meiosis",
                "content": (
                    "Mitosis produces two genetically identical diploid daughter cells "
                    "and underlies growth, tissue repair, and asexual reproduction. Its "
                    "phases are prophase, prometaphase, metaphase, anaphase, and "
                    "telophase, followed by cytokinesis. Sister chromatids attach to "
                    "spindle fibres at the kinetochores and separate during anaphase, "
                    "so each daughter cell ends up with one copy of every chromosome.\n\n"
                    "Meiosis produces four haploid gametes from a single diploid "
                    "precursor and consists of two sequential divisions, meiosis I and "
                    "meiosis II. Meiosis I is the reduction division: homologous "
                    "chromosomes pair as tetrads in prophase I, exchange segments via "
                    "crossing over (chiasmata), and then separate at anaphase I. "
                    "Meiosis II resembles mitosis and separates sister chromatids.\n\n"
                    "Two mechanisms create genetic variation. Independent assortment "
                    "during metaphase I randomly orients each homologous pair, yielding "
                    "2^23 possible chromosome combinations in humans. Crossing over "
                    "shuffles alleles between homologues, producing recombinant "
                    "chromatids and effectively unlimited genetic diversity in gametes."
                ),
            },
            {
                "title": "Photosynthesis",
                "content": (
                    "Photosynthesis converts light energy into chemical energy stored "
                    "in glucose. The overall reaction is 6 CO2 + 6 H2O + light → "
                    "C6H12O6 + 6 O2 and takes place in two linked stages inside "
                    "chloroplasts.\n\n"
                    "The light-dependent reactions occur in the thylakoid membranes. "
                    "Photosystem II absorbs photons, splits water (releasing O2), and "
                    "passes excited electrons down an electron transport chain that "
                    "pumps protons into the thylakoid lumen. The resulting proton "
                    "gradient drives ATP synthase to make ATP. Photosystem I re-energises "
                    "the electrons and reduces NADP+ to NADPH.\n\n"
                    "The Calvin cycle runs in the stroma and is light-independent. "
                    "RuBisCO fixes atmospheric CO2 onto ribulose-1,5-bisphosphate "
                    "(RuBP), and the resulting 3-PGA molecules are reduced to G3P "
                    "using the ATP and NADPH produced by the light reactions. Most "
                    "G3P regenerates RuBP, but one out of every six exits the cycle "
                    "and feeds into glucose synthesis."
                ),
            },
        ],
    },
    {
        "name": "Calculus II",
        "accuracy": 0.30,  # Jordan struggles here — drives gap detector + insights
        "notes": [
            {
                "title": "Integration by Parts",
                "content": (
                    "Integration by parts is the integral version of the product rule "
                    "for differentiation. The formula is ∫ u dv = uv − ∫ v du. The "
                    "skill is choosing which factor of the integrand to call u and "
                    "which to call dv so that the new integral ∫ v du is simpler than "
                    "the original.\n\n"
                    "The LIATE mnemonic offers a default priority for choosing u: "
                    "Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential. "
                    "Pick whichever class appears earliest in that list as u. For "
                    "example, in ∫ x · e^x dx the algebraic x outranks the exponential "
                    "e^x, so u = x and dv = e^x dx, giving du = dx and v = e^x. The "
                    "integral becomes x e^x − ∫ e^x dx = x e^x − e^x + C.\n\n"
                    "Some integrals require integration by parts twice in succession, "
                    "or a 'tabular' shortcut when u differentiates to zero in a few "
                    "steps. Others (like ∫ e^x sin x dx) cycle back to the original "
                    "integral after two applications — you solve for the original "
                    "integral algebraically. Definite integrals add evaluation bars: "
                    "∫_a^b u dv = [uv]_a^b − ∫_a^b v du."
                ),
            },
            {
                "title": "Sequences and Series Convergence",
                "content": (
                    "A sequence {a_n} converges if its terms approach a finite limit "
                    "as n → ∞. A series Σ a_n converges if the sequence of partial "
                    "sums S_n = a_1 + a_2 + … + a_n converges. The nth-term test is "
                    "the simplest necessary condition: if lim a_n ≠ 0, the series "
                    "diverges. The converse does not hold.\n\n"
                    "Several standard tests apply to series with positive terms. The "
                    "geometric series Σ a r^n converges iff |r| < 1, with sum a/(1−r). "
                    "The p-series Σ 1/n^p converges iff p > 1. The integral test "
                    "connects Σ a_n to ∫ f(x) dx when f is positive, continuous, and "
                    "decreasing. The comparison and limit-comparison tests pit a "
                    "series against a known benchmark.\n\n"
                    "For series with both positive and negative terms, the alternating "
                    "series test (Leibniz) requires that |a_n| decrease monotonically "
                    "to zero. Absolute convergence — Σ |a_n| converges — implies "
                    "ordinary convergence and is the stronger condition. The ratio "
                    "test computes L = lim |a_{n+1}/a_n|: converges if L < 1, "
                    "diverges if L > 1, inconclusive if L = 1."
                ),
            },
            {
                "title": "Taylor and Maclaurin Series",
                "content": (
                    "A Taylor series represents a function as an infinite polynomial "
                    "centred at a point a: f(x) = Σ f^(n)(a)/n! · (x − a)^n. When "
                    "a = 0 the expansion is called a Maclaurin series. The series "
                    "converges to f(x) on its radius of convergence R, which can be "
                    "found via the ratio test on the coefficient sequence.\n\n"
                    "Four Maclaurin series are worth memorising. e^x = Σ x^n / n! "
                    "converges for all x. sin x = Σ (−1)^n x^(2n+1) / (2n+1)! and "
                    "cos x = Σ (−1)^n x^(2n) / (2n)! both converge for all x. The "
                    "geometric series 1/(1−x) = Σ x^n converges only for |x| < 1.\n\n"
                    "Taylor series are useful for approximating function values "
                    "(truncate after a few terms), evaluating limits where "
                    "L'Hôpital's rule is messy, integrating non-elementary functions "
                    "like ∫ e^(−x^2) dx term-by-term, and solving ordinary "
                    "differential equations by power-series methods."
                ),
            },
            {
                "title": "Improper Integrals",
                "content": (
                    "An improper integral has either an infinite limit of integration "
                    "or an integrand that becomes infinite somewhere on the interval. "
                    "Each is handled by replacing the offending boundary with a finite "
                    "limit and then taking a limit at the end.\n\n"
                    "For ∫_1^∞ f(x) dx, evaluate ∫_1^t f(x) dx and take t → ∞. If "
                    "that limit is finite, the integral converges to that value; "
                    "otherwise it diverges. The p-test for integrals mirrors the "
                    "series version: ∫_1^∞ 1/x^p dx converges iff p > 1. For "
                    "integrals over (−∞, ∞), split at any convenient point — both "
                    "halves must converge independently.\n\n"
                    "When the integrand has a vertical asymptote inside [a, b], "
                    "split the integral at the singularity and take one-sided limits. "
                    "∫_0^1 1/√x dx converges (to 2) even though the integrand blows "
                    "up at 0. The comparison test for improper integrals follows the "
                    "same logic as for series: if 0 ≤ f ≤ g and ∫ g converges, then "
                    "∫ f converges; if 0 ≤ g ≤ f and ∫ g diverges, then ∫ f diverges."
                ),
            },
        ],
    },
    {
        "name": "Introduction to Psychology",
        "accuracy": 0.60,
        "notes": [
            {
                "title": "Operant Conditioning",
                "content": (
                    "Operant conditioning, formalised by B. F. Skinner, explains how "
                    "the consequences of a behaviour shape its future frequency. "
                    "Reinforcement increases behaviour; punishment decreases it. Each "
                    "can be 'positive' (adding a stimulus) or 'negative' (removing one), "
                    "giving four combinations: positive reinforcement, negative "
                    "reinforcement, positive punishment, negative punishment.\n\n"
                    "Schedules of reinforcement control how often a reward is "
                    "delivered. Continuous reinforcement (reward after every response) "
                    "produces fast acquisition but rapid extinction. Partial schedules "
                    "produce slower acquisition but stronger resistance to extinction. "
                    "The four classic partial schedules combine 'fixed' or 'variable' "
                    "with 'ratio' (based on number of responses) or 'interval' (based "
                    "on time elapsed). Variable-ratio schedules produce the highest, "
                    "steadiest response rates — the principle behind slot machines.\n\n"
                    "Shaping uses successive approximations to teach complex "
                    "behaviours, rewarding incrementally closer versions of the target. "
                    "Extinction occurs when reinforcement is withdrawn entirely, "
                    "though responses often spike briefly (an 'extinction burst') "
                    "before fading."
                ),
            },
            {
                "title": "Memory Systems",
                "content": (
                    "The Atkinson–Shiffrin multi-store model proposes three sequential "
                    "memory systems. Sensory memory holds incoming sensory information "
                    "for a fraction of a second (iconic for vision, echoic for hearing) "
                    "before it is either attended to or lost. Short-term or working "
                    "memory holds a limited number of items — Miller's classic "
                    "estimate is 7 ± 2 chunks — for roughly 20 seconds without "
                    "rehearsal.\n\n"
                    "Long-term memory has effectively unlimited capacity and is "
                    "divided into explicit (declarative) and implicit (non-declarative) "
                    "stores. Explicit memory splits into episodic (personal events) "
                    "and semantic (general facts). Implicit memory covers procedural "
                    "skills, classical conditioning, and priming.\n\n"
                    "Encoding strength is improved by elaborative rehearsal (linking "
                    "new material to existing knowledge), distributed practice "
                    "(spacing study over time), and the testing effect (retrieval "
                    "itself strengthens memory more than re-reading). Retrieval cues "
                    "depend on context and state, which is why memory is often "
                    "stronger when recall conditions match encoding conditions."
                ),
            },
            {
                "title": "Cognitive Dissonance",
                "content": (
                    "Cognitive dissonance, introduced by Leon Festinger in 1957, is "
                    "the psychological discomfort that arises when a person holds two "
                    "or more inconsistent beliefs, attitudes, or behaviours. The "
                    "discomfort motivates the person to reduce the inconsistency, "
                    "usually by changing one of the cognitions rather than tolerating "
                    "the tension.\n\n"
                    "Festinger and Carlsmith's 1959 study had participants perform a "
                    "boring task and then tell the next participant it was enjoyable. "
                    "Those paid $1 to lie reported the task as more enjoyable than "
                    "those paid $20. The $20 group had ample external justification; "
                    "the $1 group had to internally re-evaluate the task to resolve "
                    "the dissonance between 'I lied' and 'I'm not a liar.'\n\n"
                    "Common dissonance-reduction strategies include changing the "
                    "behaviour, changing the belief, adding new cognitions that "
                    "rationalise the inconsistency, trivialising the conflict, or "
                    "avoiding information that highlights it. Dissonance theory "
                    "underlies many marketing, persuasion, and counter-attitudinal "
                    "advocacy effects studied in social psychology."
                ),
            },
        ],
    },
    {
        "name": "U.S. History",
        "accuracy": 0.70,
        "notes": [
            {
                "title": "Declaration of Independence",
                "content": (
                    "The Declaration of Independence, adopted on July 4, 1776, "
                    "formally separated the thirteen American colonies from Great "
                    "Britain. Drafted primarily by Thomas Jefferson with revisions "
                    "from Benjamin Franklin and John Adams, it laid out a "
                    "philosophical justification for revolution grounded in natural "
                    "rights theory, particularly the writings of John Locke.\n\n"
                    "Its preamble asserts that all men are created equal and endowed "
                    "with unalienable rights to life, liberty, and the pursuit of "
                    "happiness. Governments derive their just powers from the consent "
                    "of the governed, and the people retain the right to alter or "
                    "abolish governments that fail to secure these rights.\n\n"
                    "The body of the document enumerates twenty-seven grievances "
                    "against King George III — taxation without representation, "
                    "quartering of standing armies, dissolution of colonial "
                    "legislatures — that, taken together, were meant to demonstrate a "
                    "pattern of tyranny justifying separation. The Declaration was "
                    "primarily a rhetorical and diplomatic document; the practical "
                    "war for independence ran until the Treaty of Paris in 1783."
                ),
            },
            {
                "title": "Causes of the Civil War",
                "content": (
                    "The American Civil War (1861–1865) had multiple intertwined "
                    "causes, but the institution of slavery sat at the centre. Northern "
                    "states had largely industrialised by the mid-nineteenth century "
                    "while Southern states remained agricultural, dependent on enslaved "
                    "labour for cotton, tobacco, and rice production. Westward "
                    "expansion forced the question of whether new states would enter "
                    "the Union as slave or free.\n\n"
                    "The Missouri Compromise (1820), the Compromise of 1850, and the "
                    "Kansas–Nebraska Act (1854) each tried — and ultimately failed — "
                    "to manage that question through legislative balance. The Supreme "
                    "Court's Dred Scott decision (1857) ruled that Black people, "
                    "enslaved or free, were not citizens and that Congress could not "
                    "ban slavery in the territories, radicalising abolitionist "
                    "sentiment in the North.\n\n"
                    "Underlying tensions also included disputes over states' rights, "
                    "tariff policy, and competing economic models. But it was Abraham "
                    "Lincoln's 1860 election as a Republican opposed to the expansion "
                    "of slavery that prompted South Carolina's secession that "
                    "December, followed by ten other Southern states forming the "
                    "Confederate States of America by mid-1861."
                ),
            },
            {
                "title": "The New Deal",
                "content": (
                    "The New Deal was a series of programs, public-work projects, "
                    "financial reforms, and regulations enacted by President Franklin "
                    "D. Roosevelt between 1933 and 1939 in response to the Great "
                    "Depression. It marked a permanent expansion of federal "
                    "responsibility for the welfare of citizens and the regulation of "
                    "the economy.\n\n"
                    "The First New Deal (1933–34) focused on immediate relief and "
                    "stabilisation. The Emergency Banking Act and the Glass–Steagall "
                    "Act stabilised the financial system and created the FDIC. The "
                    "Civilian Conservation Corps (CCC) and the Works Progress "
                    "Administration (WPA) employed millions on infrastructure and "
                    "conservation projects. The Agricultural Adjustment Act (AAA) "
                    "paid farmers to reduce output and raise crop prices.\n\n"
                    "The Second New Deal (1935–38) leaned toward long-term reform. "
                    "The Social Security Act (1935) established old-age pensions and "
                    "unemployment insurance. The National Labor Relations Act "
                    "(Wagner Act) guaranteed workers the right to unionise. While the "
                    "New Deal did not end the Depression — that took World War II "
                    "mobilisation — it fundamentally reshaped the relationship "
                    "between the federal government and American economic life."
                ),
            },
        ],
    },
]


# A short, realistic tutoring conversation about Jordan's weakest subject so
# the insight extractor produces meaningful StudentInsight rows.
CHAT_TRANSCRIPT: list[dict] = [
    {
        "role": "user",
        "content": (
            "I keep getting stuck on integration by parts. I know the formula "
            "is ∫u dv = uv - ∫v du but I never know which part of the "
            "integrand should be u."
        ),
    },
    {
        "role": "assistant",
        "content": (
            "The standard trick is the LIATE mnemonic — Logarithmic, Inverse "
            "trig, Algebraic, Trigonometric, Exponential. Whichever class "
            "appears first in that list is usually your best pick for u. For "
            "∫ x·e^x dx, x is algebraic and e^x is exponential, so u = x."
        ),
    },
    {
        "role": "user",
        "content": (
            "OK that helps. But when I tried ∫ x² · sin(x) dx I got stuck "
            "after one pass — I had to do integration by parts twice and I "
            "lost track of signs. Is there a faster way?"
        ),
    },
    {
        "role": "assistant",
        "content": (
            "Yes — tabular integration. You can use it when u differentiates "
            "to zero in a few steps (like x²). Make a column of repeated "
            "derivatives of u and a column of repeated antiderivatives of dv, "
            "then alternate signs (+, −, +, −) as you multiply across the "
            "diagonals. It's mechanical and avoids the sign mistakes."
        ),
    },
    {
        "role": "user",
        "content": (
            "That's exactly my problem — I always mess up signs when I do it "
            "twice. I think I also struggle with the alternating series test "
            "for similar reasons, I miss whether the absolute values are "
            "decreasing."
        ),
    },
    {
        "role": "assistant",
        "content": (
            "Two separate concepts but a common thread: both reward careful, "
            "step-by-step bookkeeping rather than holding everything in your "
            "head. For tabular integration, write the table out instead of "
            "tracking it mentally. For the alternating series test, write a_n "
            "explicitly and check (1) a_n > 0, (2) a_n is decreasing, "
            "(3) lim a_n = 0 — three separate ticks, not one impression."
        ),
    },
    {
        "role": "user",
        "content": (
            "I think I learn better when I see worked examples first and "
            "then try problems, rather than reading the theorem in the "
            "abstract."
        ),
    },
]
CHAT_SUBJECT_HINT = "Calculus II"


# ═════════════════════════════════════════════════════════════════════════════
# Orchestration
# ═════════════════════════════════════════════════════════════════════════════

async def main() -> int:
    print(f"[seed] DATABASE_URL: {settings.DATABASE_URL}")
    print(f"[seed] LLM_PROVIDER: {settings.LLM_PROVIDER}")
    print()

    # Make sure schema exists (no-op on a healthy dev DB)
    await init_db()

    counts = {"topics": 0, "questions": 0, "attempts": 0}

    async with AsyncSessionLocal() as db:
        # ── 1. Wipe any prior demo user ───────────────────────────────────
        await _wipe_existing_demo(db)

        # ── 2. Create user ────────────────────────────────────────────────
        user = await _create_user(db)
        await db.commit()
        await db.refresh(user)
        print(f"[seed] Created user id={user.id} ({user.email})")

        # ── 3. Notes ──────────────────────────────────────────────────────
        all_notes: list[Note] = []
        for subj in SUBJECTS:
            print(f"\n[seed] Subject: {subj['name']}")
            for note_def in subj["notes"]:
                note = Note(
                    user_id=user.id,
                    title=note_def["title"],
                    content=note_def["content"],
                    subject=subj["name"],  # bypass normalize_subject deliberately
                )
                db.add(note)
                await db.flush()
                await db.refresh(note)
                all_notes.append(note)
                print(f"  + note id={note.id} «{note.title}»")
        await db.commit()

        # ── 4. Topic extraction via real LLM service ──────────────────────
        print(f"\n[seed] Extracting topics for {len(all_notes)} notes (slow on Ollama)…")
        for i, note in enumerate(all_notes, 1):
            print(f"  [{i:2d}/{len(all_notes)}] {note.title}…", end="", flush=True)
            try:
                llm_result = await extract_topics(note.content)
            except Exception as exc:
                print(f" ERROR: {exc}")
                continue
            if not llm_result or not llm_result.get("topics"):
                print(" (LLM returned no topics — skipping)")
                continue

            created_here = 0
            for topic_data in llm_result["topics"]:
                parent = Topic(
                    name=topic_data.get("name", "Unnamed Topic"),
                    subject=note.subject,
                    note_id=note.id,
                    parent_topic_id=None,
                )
                db.add(parent)
                await db.flush()
                created_here += 1
                for sub_name in topic_data.get("subtopics", []) or []:
                    db.add(Topic(
                        name=sub_name,
                        subject=note.subject,
                        note_id=note.id,
                        parent_topic_id=parent.id,
                    ))
                    created_here += 1
            await db.commit()
            counts["topics"] += created_here
            print(f" +{created_here} topics")

        # ── 5. Quizzes via real generation + mixed-accuracy attempts ──────
        print(f"\n[seed] Generating quizzes ({NOTES_QUIZZED_PER_SUBJECT} notes/subject × "
              f"{QUESTIONS_PER_QUIZ} Qs each)…")
        for subj in SUBJECTS:
            subj_notes = [n for n in all_notes if n.subject == subj["name"]]
            target_accuracy = subj["accuracy"]
            for note in subj_notes[:NOTES_QUIZZED_PER_SUBJECT]:
                # First topic for this note becomes the quiz topic
                topic = (await db.execute(
                    select(Topic).where(Topic.note_id == note.id).limit(1)
                )).scalar_one_or_none()
                if topic is None:
                    topic = Topic(name=note.title, subject=note.subject, note_id=note.id)
                    db.add(topic)
                    await db.flush()
                    counts["topics"] += 1

                print(f"  [{subj['name']}] «{note.title}» (target {int(target_accuracy*100)}%)…",
                      end="", flush=True)

                try:
                    llm_result = await generate_questions(
                        note_content=note.content[:3000],
                        topic_name=topic.name,
                        count=QUESTIONS_PER_QUIZ,
                        question_type="mcq",
                    )
                except Exception as exc:
                    print(f" ERROR: {exc}")
                    continue
                if not llm_result or not llm_result.get("questions"):
                    print(" (LLM returned no questions — skipping)")
                    continue

                questions: list[Question] = []
                for q_data in llm_result["questions"]:
                    options = q_data.get("options")
                    q = Question(
                        topic_id=topic.id,
                        note_id=note.id,
                        type=q_data.get("type", "mcq"),
                        content=q_data.get("content", ""),
                        options=json.dumps(options) if options else None,
                        correct_answer=str(q_data.get("correct_answer", "")),
                        explanation=q_data.get("explanation"),
                        difficulty=int(q_data.get("difficulty", 3)),
                    )
                    db.add(q)
                    questions.append(q)
                await db.flush()
                for q in questions:
                    await db.refresh(q)
                counts["questions"] += len(questions)

                # Mixed-accuracy attempts: deterministically spread the wrongs
                # so subject-level hit rate ≈ target_accuracy.
                correct_count = 0
                history_for_quiz_result: list[dict] = []
                for idx, q in enumerate(questions):
                    is_correct = ((idx + 1) / len(questions)) <= target_accuracy
                    if is_correct:
                        user_answer = q.correct_answer
                    else:
                        opts = json.loads(q.options) if q.options else {}
                        wrong_keys = [k for k in opts.keys() if k != q.correct_answer]
                        user_answer = wrong_keys[0] if wrong_keys else "A"

                    db.add(Attempt(
                        question_id=q.id,
                        user_id=user.id,
                        user_answer=user_answer,
                        is_correct=is_correct,
                        time_taken_seconds=25 + idx * 4,
                    ))
                    counts["attempts"] += 1
                    if is_correct:
                        correct_count += 1

                    history_for_quiz_result.append({
                        "question_id": q.id,
                        "content": q.content,
                        "type": q.type,
                        "options": q.options,
                        "user_answer": user_answer,
                        "correct_answer": q.correct_answer,
                        "is_correct": is_correct,
                        "explanation": q.explanation,
                        "is_flagged": False,
                    })

                # QuizResult summary row (powers Results page history)
                db.add(QuizResult(
                    user_id=user.id,
                    note_id=note.id,
                    note_title=note.title,
                    score=correct_count,
                    total_questions=len(questions),
                    questions_json=json.dumps(history_for_quiz_result),
                ))
                await db.commit()
                print(f" {correct_count}/{len(questions)} correct")

        # ── 6. Seed chat session + run real insight extraction ────────────
        print(f"\n[seed] Seeding chat session ({len(CHAT_TRANSCRIPT)} msgs) about "
              f"{CHAT_SUBJECT_HINT}…")
        session_id = str(uuid.uuid4())
        for msg in CHAT_TRANSCRIPT:
            db.add(ChatMessage(
                user_id=user.id,
                role=msg["role"],
                content=msg["content"],
                session_id=session_id,
            ))
        await db.commit()

        print("[seed] Running insight extraction (one LLM call)…", end="", flush=True)
        n_insights = await generate_insights(session_id, user.id)
        print(f" +{n_insights} insights")

        # ── Final summary ────────────────────────────────────────────────
        insights_total = await db.scalar(
            select(func.count(StudentInsight.id)).where(StudentInsight.user_id == user.id)
        ) or 0
        subjects_count = len({n.subject for n in all_notes})

    print()
    print("=" * 64)
    print("  DEMO ACCOUNT READY")
    print("=" * 64)
    print(f"  URL:      http://localhost:5173/login")
    print(f"  Email:    {DEMO_EMAIL}")
    print(f"  Password: {DEMO_PASSWORD}")
    print(f"  Name:     {DEMO_NAME}")
    print()
    print(f"  Subjects:   {subjects_count}")
    print(f"  Notes:      {len(all_notes)}")
    print(f"  Topics:     {counts['topics']}")
    print(f"  Questions:  {counts['questions']}")
    print(f"  Attempts:   {counts['attempts']}")
    print(f"  Insights:   {insights_total}")
    print("=" * 64)
    return 0


# ── helpers ──────────────────────────────────────────────────────────────────

async def _wipe_existing_demo(db: AsyncSession) -> None:
    """Remove the demo user and every row that references it.

    Done with explicit DELETE statements rather than relying on FK cascade
    because SQLite (dev) doesn't enable PRAGMA foreign_keys by default in this
    app's engine setup, so DB-level ON DELETE CASCADE won't fire.
    """
    user = await db.scalar(select(User).where(User.email == DEMO_EMAIL.lower()))
    if user is None:
        return
    uid = user.id
    print(f"[seed] Wiping existing demo user id={uid} and all its data…")

    note_ids = list((await db.scalars(select(Note.id).where(Note.user_id == uid))).all())

    if note_ids:
        await db.execute(delete(Attempt).where(Attempt.question_id.in_(
            select(Question.id).where(Question.note_id.in_(note_ids))
        )))
        await db.execute(delete(Question).where(Question.note_id.in_(note_ids)))
        await db.execute(delete(Topic).where(Topic.note_id.in_(note_ids)))

    await db.execute(delete(Attempt).where(Attempt.user_id == uid))
    await db.execute(delete(QuizResult).where(QuizResult.user_id == uid))
    await db.execute(delete(Note).where(Note.user_id == uid))

    await db.execute(delete(StudentInsight).where(StudentInsight.user_id == uid))
    await db.execute(delete(ChatMessage).where(ChatMessage.user_id == uid))
    await db.execute(delete(Flashcard).where(Flashcard.user_id == uid))
    await db.execute(delete(StudySession).where(StudySession.user_id == uid))
    await db.execute(delete(UsageCounter).where(UsageCounter.user_id == uid))
    await db.execute(delete(UserSettings).where(UserSettings.user_id == uid))
    await db.execute(delete(User).where(User.id == uid))
    await db.commit()


async def _create_user(db: AsyncSession) -> User:
    hashed = bcrypt.hashpw(DEMO_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = User(
        email=DEMO_EMAIL.lower().strip(),
        name=DEMO_NAME,
        hashed_password=hashed,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
