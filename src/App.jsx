import { useEffect, useMemo, useState } from "react";

const navigation = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "plans", label: "Project plans", icon: "route" },
  { id: "settings", label: "Settings", icon: "spark" },
];

function Icon({ name, size = 17 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    route: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 5h4a4 4 0 0 1 4 4v6a4 4 0 0 0 4 4" /><path d="M6 7v11" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.4L22 17l-1.9.7L19 20l-1.1-2.3L16 17l1.9-.6L19 14Z" /></>,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
    trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m6 7 1 13h10l1-13M9 7V4h6v3" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [theme, setTheme] = useState(() => localStorage.getItem("nexroute-theme") === "light" ? "light" : "dark");
  const [idea, setIdea] = useState("");
  const [daysAvailable, setDaysAvailable] = useState(5);
  const [plans, setPlans] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [providerStatus, setProviderStatus] = useState({ configured: false });
  const [providerLoading, setProviderLoading] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [providerError, setProviderError] = useState("");
  const [migrationNotice, setMigrationNotice] = useState("");

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedId) ?? plans[0] ?? null,
    [plans, selectedId],
  );
  const selectedTaskCount = selectedPlan?.aiPlan.tasks.length ?? 0;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("nexroute-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!window.nexroute) {
      setError("Open the NexRoute desktop app to manage project plans.");
      setInitializing(false);
      setProviderLoading(false);
      return undefined;
    }
    let active = true;
    window.nexroute.getPlans()
      .then(({ plans: savedPlans, removedDemoPlans }) => {
        if (!active) return;
        setPlans(savedPlans);
        setSelectedId(savedPlans[0]?.id ?? null);
        if (removedDemoPlans > 0) {
          setMigrationNotice(
            `${removedDemoPlans} old demo-only plan${removedDemoPlans === 1 ? " was" : "s were"} removed. Real Gemini roadmaps were kept.`,
          );
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message ?? "Could not load saved plans.");
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    window.nexroute.getGeminiStatus()
      .then((status) => {
        if (active) setProviderStatus(status);
      })
      .catch((requestError) => {
        if (active) setProviderError(requestError.message ?? "Could not read Gemini settings.");
      })
      .finally(() => {
        if (active) setProviderLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function createPlan(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await window.nexroute.createPlan({ idea, daysAvailable });
      setPlans((current) => [result, ...current]);
      setSelectedId(result.id);
      setActiveView("overview");
    } catch (requestError) {
      setError(requestError.message ?? "Could not generate a roadmap.");
    } finally {
      setLoading(false);
    }
  }

  async function deletePlan(planId) {
    if (!window.confirm("Delete this saved roadmap? This cannot be undone.")) return;
    setError("");
    try {
      await window.nexroute.deletePlan(planId);
      setPlans((current) => current.filter((plan) => plan.id !== planId));
      setSelectedId((current) => (current === planId ? null : current));
    } catch (requestError) {
      setError(requestError.message ?? "Could not delete the roadmap.");
    }
  }

  async function saveGeminiKey(event) {
    event.preventDefault();
    setSavingProvider(true);
    setProviderError("");
    setProviderMessage("");
    try {
      const status = await window.nexroute.saveGeminiKey({
        apiKey: apiKeyInput,
        consent: privacyAccepted,
      });
      setProviderStatus(status);
      setApiKeyInput("");
      setPrivacyAccepted(false);
      setProviderMessage("Gemini key saved. The connection is verified when you generate a roadmap.");
    } catch (requestError) {
      setProviderError(requestError.message ?? "Could not save the Gemini API key.");
    } finally {
      setSavingProvider(false);
    }
  }

  async function removeGeminiKey() {
    setSavingProvider(true);
    setProviderError("");
    setProviderMessage("");
    try {
      const status = await window.nexroute.removeGeminiKey();
      setProviderStatus(status);
      setProviderMessage("Gemini was disconnected. Saved roadmaps remain on this device.");
    } catch (requestError) {
      setProviderError(requestError.message ?? "Could not remove the Gemini API key.");
    } finally {
      setSavingProvider(false);
    }
  }

  async function openGeminiKeyPage() {
    setProviderError("");
    try {
      await window.nexroute.openGeminiKeyPage();
    } catch (requestError) {
      setProviderError(requestError.message ?? "Could not open Google AI Studio.");
    }
  }

  function renderPlanner() {
    return (
      <>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className={`live-dot ${providerStatus.configured ? "" : "disconnected"}`} /> {providerStatus.configured ? "GEMINI KEY SAVED" : "GEMINI CONNECTION REQUIRED"}</div>
            <h1>Build with a plan.<br /><span>Stay in control.</span></h1>
            <p>Turn your brief into an actionable roadmap with Google Gemini. NexRoute stores plans locally and sends a brief only when you choose to generate one.</p>
            <div className="hero-meta"><span><Icon name="spark" size={14} /> AI-generated roadmaps</span><i /><span>Private local plan library</span></div>
          </div>
          <div className="hero-graphic" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="orbit-center"><Icon name="route" size={23} /></div>
            <span className="orbit-node node-a">B</span><span className="orbit-node node-b">G</span><span className="orbit-node node-c">R</span>
            <span className="graphic-caption">BRIEF → GEMINI → ROADMAP</span>
          </div>
        </section>

        <section className="planner-card">
          <div className="section-heading">
            <div><div className="eyebrow muted-eyebrow">01 / PROJECT BRIEF</div><h2>What are you building?</h2></div>
            <span className={`privacy-chip ${providerStatus.configured ? "remote" : ""}`}><span className="privacy-dot" /> {providerStatus.configured ? "Sent to Google only on submit" : "No provider connected"}</span>
          </div>
          <form onSubmit={createPlan}>
            <label className="sr-only" htmlFor="project-idea">Describe your project</label>
            <textarea id="project-idea" value={idea} onChange={(event) => setIdea(event.target.value)} maxLength={4000} placeholder="Describe the product, audience, and outcome you want…" />
            <div className="form-footer">
              <span className="character-count">{idea.length} / 4000</span>
              <div className="form-actions">
                <label className="deadline-select"><Icon name="clock" size={15} /><span>Target</span>
                  <select value={daysAvailable} onChange={(event) => setDaysAvailable(Number(event.target.value))}>
                    {[3, 5, 7, 10, 14, 21, 30].map((days) => <option key={days} value={days}>{days} days</option>)}
                  </select>
                </label>
                <button className="primary-button" disabled={loading || providerLoading || !providerStatus.configured || !idea.trim()} type="submit">
                  {loading ? "Generating roadmap…" : "Generate with Gemini"} <Icon name="arrow" size={16} />
                </button>
                {!providerLoading && !providerStatus.configured && (
                  <button className="secondary-button" onClick={() => setActiveView("settings")} type="button">Connect Gemini</button>
                )}
              </div>
            </div>
          </form>
          {error && <div className="error-message" role="alert">{error}</div>}
        </section>

        <section className="metrics-grid" aria-label="Workspace overview">
          <Metric label="SAVED ROADMAPS" value={plans.length} detail="Stored on this device" icon="route" />
          <Metric label="AI PROVIDER" value={providerStatus.configured ? "Ready" : "Setup"} detail={providerStatus.configured ? "Google Gemini key saved" : "Connect Gemini in Settings"} icon="spark" />
          <Metric label="CURRENT ROADMAP TASKS" value={selectedTaskCount} detail={selectedPlan ? selectedPlan.aiPlan.model : "Generate a roadmap to begin"} icon="check" />
        </section>

        {initializing ? <div className="loading-state">Loading your local workspace…</div> : selectedPlan ? <PlanResults plan={selectedPlan} /> : <GettingStarted onOpenSettings={() => setActiveView("settings")} />}
      </>
    );
  }

  function renderView() {
    if (activeView === "plans") {
      return <PlansView plans={plans} onDelete={deletePlan} onSelect={(id) => { setSelectedId(id); setActiveView("overview"); }} />;
    }
    if (activeView === "settings") {
      return (
        <SettingsView
          apiKeyInput={apiKeyInput}
          error={providerError}
          loading={providerLoading}
          message={providerMessage}
          onApiKeyInput={setApiKeyInput}
          onOpenKeyPage={openGeminiKeyPage}
          onPrivacyAccepted={setPrivacyAccepted}
          onRemoveKey={removeGeminiKey}
          onSaveKey={saveGeminiKey}
          privacyAccepted={privacyAccepted}
          saving={savingProvider}
          status={providerStatus}
        />
      );
    }
    return renderPlanner();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActiveView("overview"); }}>
          <span className="brand-mark"><Icon name="route" size={19} /></span><span>NexRoute</span><span className="version-pill">BETA</span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.id} className={`nav-item ${activeView === item.id ? "active" : ""}`} onClick={() => setActiveView(item.id)}>
              <Icon name={item.icon} size={16} />{item.label}
              {item.id === "plans" && plans.length > 0 && <span className="nav-count">{plans.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><div className="note-icon"><Icon name="spark" size={15} /></div><div><strong>Roadmaps, not simulations</strong><p>AI plans stay on this device after generation.</p></div></div>
        <div className="user-row"><div className="avatar">N</div><div className="user-copy"><strong>Local workspace</strong><span>Personal plan library</span></div><span className={`online-indicator ${providerStatus.configured ? "" : "disconnected"}`} /></div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{navigation.find((item) => item.id === activeView)?.label ?? "Overview"}</strong></div>
          <div className="topbar-right"><button className="theme-toggle" type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☼ Light" : "☾ Dark"}</button><span className="provider-status"><span className={`live-dot ${providerStatus.configured ? "" : "disconnected"}`} /> {providerStatus.configured ? "Gemini key saved" : "Gemini not connected"}</span><span className="topbar-divider" /><span className="build-tag">v0.1.0</span></div>
        </header>
        <div className="content-area">
          {migrationNotice && <div className="migration-notice" role="status">{migrationNotice}</div>}
          {error && <div className="error-message global-error" role="alert">{error}</div>}
          {renderView()}
        </div>
        <footer className="app-footer"><span>AI ROADMAPS · LOCAL PLAN STORAGE</span><span>NO TRACKING · API CALLS ONLY ON REQUEST</span></footer>
      </main>
    </div>
  );
}

function Metric({ label, value, detail, icon }) {
  return <div className="metric-card"><div className="metric-label">{label}</div><div className="metric-value">{value}<span className="metric-icon"><Icon name={icon} /></span></div><div className="metric-foot">{detail}</div></div>;
}

function GettingStarted({ onOpenSettings }) {
  return (
    <section className="empty-state">
      <div className="empty-mark"><Icon name="spark" size={20} /></div>
      <div><h3>Your roadmap starts with a real brief</h3><p>Connect Gemini in Settings, describe the outcome you want, and generate an AI-written plan. No sample project data is preloaded.</p>
        <button className="secondary-button empty-action" onClick={onOpenSettings} type="button">Open Settings <Icon name="arrow" size={14} /></button>
      </div>
    </section>
  );
}

function SettingsView({
  apiKeyInput,
  error,
  loading,
  message,
  onApiKeyInput,
  onOpenKeyPage,
  onPrivacyAccepted,
  onRemoveKey,
  onSaveKey,
  privacyAccepted,
  saving,
  status,
}) {
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE / SETTINGS"
        title="Connect Google Gemini."
        subtitle="NexRoute uses Gemini to generate actual project roadmaps. Provider quota dashboards and simulated execution are not included."
      />
      <section className="settings-card">
        <div className="settings-provider-heading">
          <div className="provider-logo">G</div>
          <div><strong>Google Gemini</strong><span>gemini-3.8-flash · API key integration</span></div>
          <span className={`connection-status ${status.configured ? "connected" : ""}`}>
            {loading ? "CHECKING" : status.configured ? "KEY SAVED" : "NOT CONNECTED"}
          </span>
        </div>
        <div className="settings-disclosure">
          <strong>Know what leaves your device</strong>
          <p>When you generate a roadmap, NexRoute sends the project brief and deadline to Google. Google's free-tier prompts and responses may be used to improve its products, and free access or rate limits can change. To avoid charges, use an AI Studio project without billing enabled; NexRoute cannot enforce Google billing settings. Do not send passwords, secrets, or confidential information.</p>
        </div>
        <form className="settings-form" onSubmit={onSaveKey}>
          <label htmlFor="gemini-api-key">Gemini API key</label>
          <input
            id="gemini-api-key"
            type="password"
            autoComplete="new-password"
            autoCapitalize="off"
            spellCheck="false"
            maxLength={512}
            value={apiKeyInput}
            onChange={(event) => onApiKeyInput(event.target.value)}
            placeholder={status.configured ? "Enter a replacement key" : "Paste your API key"}
          />
          <div className="settings-key-actions">
            <button className="secondary-button" disabled={saving} onClick={onOpenKeyPage} type="button">
              Get an API key <Icon name="external" size={13} />
            </button>
            <span>Encrypted with your OS credential store.</span>
          </div>
          <label className="privacy-consent">
            <input type="checkbox" checked={privacyAccepted} onChange={(event) => onPrivacyAccepted(event.target.checked)} />
            <span>I understand my project briefs will be sent to Google, and free-tier content may be used to improve Google's products.</span>
          </label>
          <div className="settings-actions">
            <button className="primary-button" disabled={saving || loading || !apiKeyInput.trim() || !privacyAccepted} type="submit">
              {saving ? "Saving securely…" : status.configured ? "Replace API key" : "Save API key"}
            </button>
            {status.configured && <button className="secondary-button" disabled={saving} onClick={onRemoveKey} type="button">Remove key</button>}
          </div>
        </form>
        {message && <div className="settings-message" role="status">{message}</div>}

        <p className="settings-local-note">NexRoute stores the key and generated roadmaps locally. It does not collect usage analytics or display provider quota estimates.</p>
      </section>
    </>
  );
}

function PlanResults({ plan }) {
  return (
    <section className="results-section">
      <div className="section-heading results-heading">
        <div><div className="eyebrow muted-eyebrow">02 / GENERATED ROADMAP</div><h2>Your project plan</h2></div>
        <span className="roadmap-deadline">Target: {plan.daysAvailable} days</span>
      </div>
      <AiRoadmap plan={plan.aiPlan} />
      <p className="roadmap-disclaimer">Task-hour figures and priorities are estimates generated by Gemini, not guarantees. Review the scope before relying on them.</p>
    </section>
  );
}

function AiRoadmap({ plan }) {
  return (
    <section className="ai-roadmap">
      <div className="ai-roadmap-heading">
        <div><div className="eyebrow muted-eyebrow">GENERATED WITH {plan.model.toUpperCase()}</div><h3>{plan.title}</h3></div>
        <span className="completed-badge"><Icon name="spark" size={13} /> {plan.provider}</span>
      </div>
      <p className="ai-roadmap-summary">{plan.summary}</p>
      <ol className="ai-task-list">
        {plan.tasks.map((task, index) => (
          <li className="ai-task" key={`${task.title}-${index}`}>
            <span className="ai-task-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="ai-task-copy"><strong>{task.title}</strong><span>{task.description}</span></div>
            <div className="ai-task-meta">
              <span className={`priority-badge priority-${task.priority}`}>{task.priority}</span>
              <span>{task.estimatedHours}h est.</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PlansView({ plans, onDelete, onSelect }) {
  return (
    <>
      <PageTitle eyebrow="WORKSPACE / PROJECTS" title="Project plans" subtitle="Gemini-generated roadmaps are stored locally on this device." />
      {plans.length ? (
        <div className="panel saved-plans">
          {plans.map((plan) => (
            <article className="saved-plan-row" key={plan.id}>
              <button className="saved-plan-select" onClick={() => onSelect(plan.id)} type="button">
                <span className="saved-plan-icon"><Icon name="route" size={16} /></span>
                <span className="saved-plan-copy"><strong>{plan.aiPlan.title}</strong><span>{new Date(plan.createdAt).toLocaleDateString()} <i /> {plan.aiPlan.tasks.length} tasks <i /> {plan.aiPlan.model}</span></span>
                <Icon name="arrow" size={16} />
              </button>
              <button className="plan-delete" aria-label={`Delete ${plan.aiPlan.title}`} onClick={() => onDelete(plan.id)} type="button"><Icon name="trash" size={15} /></button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><div className="empty-mark"><Icon name="route" size={20} /></div><div><h3>No saved roadmaps</h3><p>Generate a plan from the Overview. Only real Gemini responses are stored here.</p></div></div>
      )}
    </>
  );
}

function PageTitle({ eyebrow, title, subtitle }) {
  return <div className="page-title"><div className="eyebrow muted-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>;
}

export default App;
