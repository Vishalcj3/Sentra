import React, { useEffect, useRef, useState } from "react";
import {
  REPO_URL, SAFETY_RUN, ROLES, DAY, PIPELINE, KB_BREAKDOWN, STACK,
} from "./data.js";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ── Hero: replay of one safety check ─────────────────────────────────────── */
// Stages: 0 label · 1 retrieving · 2..(2+n-1) reasoning lines · last = verdict
function SafetyReplay() {
  const run = SAFETY_RUN;
  const lastStage = 2 + run.reasoning.length;
  const [stage, setStage] = useState(prefersReducedMotion() ? lastStage : 0);
  const timers = useRef([]);

  const play = () => {
    timers.current.forEach(clearTimeout);
    if (prefersReducedMotion()) { setStage(lastStage); return; }
    setStage(0);
    const schedule = [900, 2100];
    run.reasoning.forEach((_, i) => schedule.push(2100 + (i + 1) * 1150));
    schedule.forEach((ms, i) => {
      timers.current.push(setTimeout(() => setStage(i + 1), ms));
    });
  };

  useEffect(() => { play(); return () => timers.current.forEach(clearTimeout); }, []);

  const reasoningShown = Math.max(0, Math.min(stage - 1, run.reasoning.length));
  const done = stage >= lastStage;

  return (
    <div className="sc-replay" aria-label="Example safety check">
      <div className="sc-label">
        <div className="sc-label-head">
          <span className="sc-rx" aria-hidden="true">℞</span>
          <div>
            <div className="sc-label-patient">{run.patient.name} · {run.patient.age}</div>
            <div className="sc-mono sc-dim">{run.patient.id}</div>
          </div>
          <div className="sc-label-by sc-mono sc-dim">{run.prescriber}</div>
        </div>
        <div className="sc-label-drug">
          <span className="sc-drug-name">{run.newDrug.name}</span>
          <span className="sc-mono">{run.newDrug.dose} · {run.newDrug.frequency} · {run.newDrug.days} days</span>
        </div>
        <dl className="sc-label-ctx sc-mono">
          <div><dt>On</dt><dd>{run.patient.currentMeds.join(", ")}</dd></div>
          <div><dt>Allergic to</dt><dd>{run.patient.allergies.join(", ")}</dd></div>
        </dl>
        {done && (
          <div className="sc-stamp" role="status">
            <span>{run.verdict.severity}</span>
            <small>{run.verdict.status}</small>
          </div>
        )}
      </div>

      <div className="sc-trace">
        <div className="sc-trace-row sc-mono">
          <span className={`sc-dot ${stage >= 1 ? "is-on" : ""}`} />
          {stage >= 1
            ? <>Retrieved {run.retrieved.count} of {run.retrieved.total} knowledge chunks</>
            : <>Waiting for prescription…</>}
        </div>

        {stage >= 1 && (
          <ol className="sc-sources">
            {run.sources.map((s) => (
              <li key={s.n}>
                <span className="sc-cite">[{s.n}]</span>
                <span className="sc-source-title">{s.title}</span>
                <span className="sc-mono sc-dim">{s.score.toFixed(3)}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="sc-reasoning" aria-live="polite">
          {run.reasoning.slice(0, reasoningShown).map((line, i) => (
            <p key={i} className="sc-reason-line">{line}</p>
          ))}
        </div>

        {done && (
          <div className="sc-verdict">
            <strong>Flagged:</strong> {run.verdict.interaction}
          </div>
        )}

        <button className="sc-replay-btn" onClick={play} disabled={!done}>
          {done ? "Replay check" : "Checking…"}
        </button>
      </div>
    </div>
  );
}

/* ── Phone screens, one per role (static mock UI) ─────────────────────────── */
function Chip({ tone, children }) {
  return <span className={`ph-chip ph-chip-${tone}`}>{children}</span>;
}

function PatientScreen() {
  return (
    <>
      <div className="ph-top">
        <div className="ph-hello">Good evening, Karthik</div>
        <div className="ph-sub">3 providers can see your record</div>
      </div>
      <div className="ph-card ph-token">
        <div>
          <div className="ph-eyebrow">Next visit · today 14:00</div>
          <div className="ph-title">Dr. Anitha Raman</div>
          <div className="ph-sub">General Physician · Demo Clinic</div>
        </div>
        <div className="ph-token-num"><small>Token</small>7</div>
      </div>
      <div className="ph-section">Today's doses</div>
      <div className="ph-card ph-list">
        <div className="ph-row"><span>metformin 500 mg</span><span className="ph-mono">08:00</span><Chip tone="clear">Taken</Chip></div>
        <div className="ph-row"><span>metformin 500 mg</span><span className="ph-mono">20:00</span><Chip tone="due">Due</Chip></div>
      </div>
      <div className="ph-section">Access request</div>
      <div className="ph-card">
        <div className="ph-title">Apollo Diagnostics</div>
        <div className="ph-sub">Wants to view lab results · expires in 7 days</div>
        <div className="ph-actions"><span className="ph-btn ph-btn-solid">Approve with PIN</span><span className="ph-btn">Decline</span></div>
      </div>
    </>
  );
}

function DoctorScreen() {
  return (
    <>
      <div className="ph-top">
        <div className="ph-hello">Prescribe</div>
        <div className="ph-sub">Lakshmi N · access granted until 19 Oct</div>
      </div>
      <div className="ph-card">
        <div className="ph-row"><span className="ph-title">metformin 500 mg</span><Chip tone="clear">Clear</Chip></div>
        <div className="ph-sub">No interactions found in 8 retrieved sources</div>
      </div>
      <div className="ph-card ph-card-flag">
        <div className="ph-row"><span className="ph-title">aspirin 75 mg</span><Chip tone="severe">Severe</Chip></div>
        <p className="ph-reason">Warfarin + aspirin doubly impairs clotting — major bleeding risk [1]. Avoid unless specifically indicated [2].</p>
        <div className="ph-sources">3 sources cited ▾</div>
      </div>
      <div className="ph-section">Queue</div>
      <div className="ph-card ph-list">
        <div className="ph-row"><span className="ph-mono">#6</span><span>Ravi K</span><Chip tone="muted">In room</Chip></div>
        <div className="ph-row"><span className="ph-mono">#7</span><span>Karthik S</span><Chip tone="due">Reminded</Chip></div>
        <div className="ph-row"><span className="ph-mono">#8</span><span>Meena P</span><Chip tone="muted">Booked</Chip></div>
      </div>
    </>
  );
}

function PharmacistScreen() {
  return (
    <>
      <div className="ph-top">
        <div className="ph-hello">Verify & dispense</div>
        <div className="ph-search">Lakshmi</div>
      </div>
      <div className="ph-card">
        <div className="ph-title">Lakshmi N</div>
        <div className="ph-sub ph-mono">ID PT-7Q2K-91</div>
      </div>
      <div className="ph-section">Prescriptions (3)</div>
      <div className="ph-card ph-list">
        <div className="ph-row"><span>warfarin 5 mg</span><Chip tone="clear">Clear</Chip></div>
        <div className="ph-row"><span>pantoprazole 40 mg</span><Chip tone="clear">Clear</Chip></div>
        <div className="ph-row"><span>aspirin 75 mg</span><Chip tone="severe">Hold</Chip></div>
      </div>
      <div className="ph-card ph-card-flag">
        <div className="ph-eyebrow">Why it's on hold</div>
        <p className="ph-reason">Flagged severe by the safety agent: bleeding risk with warfarin. Confirm with the prescriber before dispensing.</p>
      </div>
    </>
  );
}

function LabScreen() {
  return (
    <>
      <div className="ph-top">
        <div className="ph-hello">Upload result</div>
        <div className="ph-sub">For Karthik S</div>
      </div>
      <div className="ph-card ph-form">
        <div className="ph-field"><small>Scan type</small><span>X-ray</span></div>
        <div className="ph-field"><small>Body part</small><span>Chest (PA view)</span></div>
        <div className="ph-field"><small>Findings</small><span>Lung fields clear. No consolidation or effusion.</span></div>
        <div className="ph-field"><small>Status</small><Chip tone="clear">Normal</Chip></div>
      </div>
      <div className="ph-btn ph-btn-solid ph-btn-wide">Send to patient's vault</div>
      <div className="ph-section">Uploaded today</div>
      <div className="ph-card ph-list">
        <div className="ph-row"><span>HbA1c · Karthik S</span><Chip tone="due">Review</Chip></div>
        <div className="ph-row"><span>CBC · Meena P</span><Chip tone="clear">Normal</Chip></div>
      </div>
    </>
  );
}

const SCREENS = { patient: PatientScreen, doctor: DoctorScreen, pharmacist: PharmacistScreen, lab: LabScreen };

function RoleExplorer() {
  const [active, setActive] = useState("patient");
  const role = ROLES.find((r) => r.id === active);
  const Screen = SCREENS[active];

  const onKey = (e) => {
    const i = ROLES.findIndex((r) => r.id === active);
    if (e.key === "ArrowRight") setActive(ROLES[(i + 1) % ROLES.length].id);
    if (e.key === "ArrowLeft") setActive(ROLES[(i - 1 + ROLES.length) % ROLES.length].id);
  };

  return (
    <div className="sc-roles">
      <div className="sc-roles-copy">
        <div className="sc-tabs" role="tablist" aria-label="Choose a role" onKeyDown={onKey}>
          {ROLES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={active === r.id}
              tabIndex={active === r.id ? 0 : -1}
              className={`sc-tab ${active === r.id ? "is-active" : ""}`}
              onClick={() => setActive(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <h3 className="sc-role-head">{role.headline}</h3>
        <ul className="sc-role-points">
          {role.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
      <div className="sc-phone" role="tabpanel" aria-label={`${role.label} screen`}>
        <div className="sc-phone-notch" />
        <div className="sc-phone-screen" key={active}>
          <Screen />
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function Showcase() {
  const kbMax = Math.max(...KB_BREAKDOWN.map((k) => k.count));

  return (
    <div className="sc">
      <a className="sc-skip" href="#check">Skip to content</a>

      <header className="sc-nav">
        <a className="sc-wordmark" href="/">vortexa</a>
        <nav aria-label="Sections">
          <a href="#roles">Roles</a>
          <a href="#reminders">Reminders</a>
          <a href="#how">How the check works</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <a className="sc-nav-cta" href="/app">Open the app</a>
      </header>

      <main>
        <section className="sc-hero" id="check">
          <div className="sc-hero-copy">
            <p className="sc-eyebrow">Patient-held health records</p>
            <h1>Every new prescription is checked against the patient's whole record.</h1>
            <p className="sc-lede">
              Vortexa keeps a patient's medicines, allergies and consents in one record they control.
              Before a drug is added, a safety agent reads that record, retrieves the relevant clinical
              evidence and says what it found, with sources.
            </p>
            <div className="sc-hero-actions">
              <a className="sc-btn sc-btn-solid" href="#how">See how the check works</a>
              <a className="sc-btn" href={REPO_URL} target="_blank" rel="noreferrer">View the code</a>
            </div>
            <p className="sc-caption sc-mono">Example run · fictional patient</p>
          </div>
          <SafetyReplay />
        </section>

        <section className="sc-section" id="roles">
          <div className="sc-section-head">
            <h2>One record, four people</h2>
            <p>The patient owns the record. Doctors, pharmacists and labs each see the part they need, once the patient approves.</p>
          </div>
          <RoleExplorer />
        </section>

        <section className="sc-section sc-day" id="reminders">
          <div className="sc-section-head">
            <h2>Reminders on the patient's clock</h2>
            <p>Hermes, the reminder agent, runs every minute. Doses fire in the patient's own time zone, and a dose nobody marks within two hours is logged as missed.</p>
          </div>
          <ol className="sc-timeline">
            {DAY.map((e) => (
              <li key={e.time + e.kind} className={`sc-tl-item sc-tl-${e.kind.toLowerCase().replace(/\W/g, "")}`}>
                <time className="sc-tl-time sc-mono">{e.time}</time>
                <div className="sc-tl-card">
                  <span className="sc-tl-kind">{e.kind}</span>
                  <p>{e.text}</p>
                  {e.action && <span className="sc-tl-action">{e.action}</span>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="sc-section" id="how">
          <div className="sc-section-head">
            <h2>How the safety check works</h2>
            <p>The same five steps run on every prescription, in order. The model only sees evidence the retriever found, and has to cite it.</p>
          </div>
          <div className="sc-how">
            <ol className="sc-pipeline">
              {PIPELINE.map((step, i) => (
                <li key={step.title}>
                  <span className="sc-step sc-mono">{i + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <aside className="sc-kb" aria-label="Knowledge base contents">
              <div className="sc-kb-total"><span>51</span> clinical knowledge chunks</div>
              <ul>
                {KB_BREAKDOWN.map((k) => (
                  <li key={k.label}>
                    <span className="sc-kb-label">{k.label}</span>
                    <span className="sc-kb-bar"><i style={{ width: `${(k.count / kbMax) * 100}%` }} /></span>
                    <span className="sc-mono">{k.count}</span>
                  </li>
                ))}
              </ul>
              <p className="sc-kb-note">If the model's answer can't be parsed or anything errors, the prescription is flagged for manual review, never marked clear.</p>
            </aside>
          </div>
        </section>

        <section className="sc-section sc-stack-section">
          <div className="sc-section-head">
            <h2>What it's built with</h2>
          </div>
          <dl className="sc-stack">
            {STACK.map((s) => (
              <div key={s.area}><dt>{s.area}</dt><dd>{s.items}</dd></div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="sc-footer">
        <span className="sc-wordmark">vortexa</span>
        <p>Built in 24 hours for a hackathon. All patients and providers shown are fictional.</p>
        <div className="sc-footer-links">
          <a href="/app">Open the app</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
