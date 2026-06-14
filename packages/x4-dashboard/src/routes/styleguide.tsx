/** Visual regression test page — renders every design system primitive against
 *  the new token palette.  Serves as a visual diff after each retheme commit.
 *  Route: /styleguide
 */

import { Currency } from "../components/Currency";

export default function StyleguidePage() {
  return (
    <div style={{ padding: 40, fontFamily: "var(--font-ui)", background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>
      <h1 style={{ fontFamily: "var(--font-ui)", fontSize: 21, fontWeight: 700, marginBottom: 8 }}>Design System — Styleguide</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 40 }}>Visual regression reference. Every primitive in one place.</p>

      {/* ── Colours ─────────────────────────────────────────── */}
      <Section title="Surfaces & borders">
        <Swatch label="bg" bg="var(--bg)" />
        <Swatch label="surface-1" bg="var(--surface-1)" border />
        <Swatch label="surface-2" bg="var(--surface-2)" border />
        <Swatch label="surface-input" bg="var(--surface-input)" border />
        <Swatch label="border" bg="var(--border)" border />
        <Swatch label="border-2" bg="var(--border-2)" border />
      </Section>

      <Section title="Accent family">
        <Swatch label="accent" bg="var(--accent)" />
        <Swatch label="accent-deep" bg="var(--accent-deep)" />
        <Swatch label="accent-light" bg="var(--accent-light)" />
        <Swatch label="accent-08" bg="var(--accent-08)" />
        <Swatch label="accent-14" bg="var(--accent-14)" />
        <Swatch label="accent-dim" bg="var(--accent-dim)" />
        <Swatch label="accent-30" bg="var(--accent-30)" />
        <Swatch label="accent-50" bg="var(--accent-50)" />
      </Section>

      <Section title="Semantic">
        <Swatch label="gold" bg="var(--gold)" />
        <Swatch label="success" bg="var(--success)" />
        <Swatch label="danger" bg="var(--danger)" />
        <Swatch label="critical" bg="var(--critical)" />
        <Swatch label="warning" bg="var(--warning)" />
        <Swatch label="info" bg="var(--info)" />
      </Section>

      <Section title="Grade ramp">
        <div style={{ display: "flex", gap: 4, height: 20, borderRadius: 0, overflow: "hidden", width: 300 }}>
          <div style={{ flex: 1, background: "var(--grade-a)" }} />
          <div style={{ flex: 1, background: "var(--grade-b)" }} />
          <div style={{ flex: 1, background: "var(--grade-c)" }} />
        </div>
      </Section>

      <Section title="Text scale">
        <TextSample label="text" color="var(--text)" size={13}>Primary body text</TextSample>
        <TextSample label="text-2" color="var(--text-2)" size={12.5}>Secondary body</TextSample>
        <TextSample label="text-muted" color="var(--text-muted)" size={9.5} upper ls={2}>Eyebrow Label</TextSample>
        <TextSample label="text-faint" color="var(--text-faint)" size={9.5}>Faint meta</TextSample>
        <TextSample label="text-ghost" color="var(--text-ghost)" size={12}>Placeholder</TextSample>
        <TextSample label="font-data + gold" color="var(--gold)" font="var(--font-data)" size={12} weight={700}><Currency value={12450000} /></TextSample>
      </Section>

      {/* ── Badges ──────────────────────────────────────────── */}
      <Section title="Badges & tags (sharp, weight 700)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge color="var(--danger)" label="Fight" />
          <Badge color="#4ade80" label="Mine" />
          <Badge color="#7dd3fc" label="Trade" />
          <SizeBadge label="S" color="#4ade80" />
          <SizeBadge label="M" color="#7dd3fc" />
          <SizeBadge label="L" color="#fb923c" />
          <SizeBadge label="XL" color="#e879f9" />
        </div>
      </Section>

      {/* ── Buttons ──────────────────────────────────────────── */}
      <Section title="Buttons (sharp, font:600 12.5px)">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btnPrimary}>Primary</button>
          <button style={btnSecondary}>Secondary</button>
          <button style={btnGhost}>Ghost</button>
          <button style={btnCommit}>Build / Commit</button>
          <button style={btnDisabled} disabled>Disabled</button>
          <button style={btnIcon}>⬡</button>
        </div>
      </Section>

      {/* ── Inputs ───────────────────────────────────────────── */}
      <Section title="Inputs (sharp)">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 300 }}>
          <input placeholder="Search ships…" style={inputBase} />
          <select style={inputBase}>
            <option>All factions</option>
            <option>Argon</option>
            <option>Paranid</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" style={checkboxStyle} /> Checkbox
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="radio" name="demo" style={radioStyle} /> Radio option
          </label>
        </div>
      </Section>

      {/* ── Chips & Toggles ──────────────────────────────────── */}
      <Section title="Filter chips & toggles">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={chipActive}>Active</span>
          <span style={chipInactive}>Inactive</span>
          <span style={chipCategory}><Dot color="var(--success)" /> Mining</span>
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <ToggleSwitch on />
          <ToggleSwitch on={false} />
        </div>
      </Section>

      {/* ── Stat bars ────────────────────────────────────────── */}
      <Section title="Stat bars">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 300 }}>
          <StatBarDemo label="Speed" value={75} />
          <StatBarDemo label="Hull" value={45} />
          <StatBarDemo label="Shields" value={12} />
        </div>
      </Section>

      {/* ── Cards ────────────────────────────────────────────── */}
      <Section title="Cards & panels">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 16 }}>
          <div style={cardStyle}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Card Title</div>
            <div style={{ color: "var(--text-2)", fontSize: 12, lineHeight: 1.5 }}>
              Card body text with secondary colour and proper line height for readability.
            </div>
          </div>
          <div style={{ ...cardStyle, borderLeft: "3px solid var(--gold)" }}>
            <div style={{ fontFamily: "var(--font-data)", fontSize: 23, fontWeight: 700, color: "var(--gold)", marginBottom: 4 }}>
              <Currency value={12400000} abbreviate />
            </div>
            <div style={{ fontFamily: "var(--font-data)", fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 2 }}>
              Net Worth
            </div>
          </div>
        </div>
      </Section>

      {/* ── Data table ───────────────────────────────────────── */}
      <Section title="Data rows">
        <div style={{ maxWidth: 500, border: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "8px 14px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-data)", fontSize: 9.5, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 2 }}>
            <span>Name</span><span>Speed</span><span>Hull</span>
          </div>
          {[
            ["Nova Vanguard", "185", "4,200"],
            ["Elite Sentinel", "212", "3,800"],
          ].map(([name, speed, hull], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "9px 14px", borderBottom: "1px solid var(--border)", fontSize: 12, background: i === 1 ? "var(--accent-08)" : "transparent" }}>
              <span>{name}</span>
              <span style={{ fontFamily: "var(--font-data)" }}>{speed}</span>
              <span style={{ fontFamily: "var(--font-data)" }}>{hull}</span>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}

/* ── Styleguide helpers ──────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontFamily: "var(--font-data)", fontSize: 9.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Swatch({ label, bg, border: showBorder }: { label: string; bg: string; border?: boolean }) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4, marginRight: 14, marginBottom: 10 }}>
      <div style={{ width: 48, height: 48, background: bg, border: showBorder ? "1px solid var(--border)" : "none", borderRadius: 0 }} />
      <span style={{ fontFamily: "var(--font-data)", fontSize: 8.5, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function TextSample({ label, children, color, size, weight, font, upper, ls }: {
  label: string; children: React.ReactNode; color: string; size: number;
  weight?: number; font?: string; upper?: boolean; ls?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 6 }}>
      <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", width: 100, textAlign: "right" }}>{label}</span>
      <span style={{ color, fontSize: size, fontWeight: weight ?? 400, fontFamily: font ?? "var(--font-ui)", textTransform: upper ? "uppercase" : "none", letterSpacing: ls }}>{children}</span>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ padding: "3px 8px", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 8.5, textTransform: "uppercase", background: `${color}29`, color, borderRadius: 0 }}>
      {label}
    </span>
  );
}

function SizeBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ padding: "3px 8px", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 8.5, textTransform: "uppercase", background: `${color}29`, color, borderRadius: 0 }}>
      {label}
    </span>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "9px 18px", fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: 12.5,
  background: "linear-gradient(135deg, var(--accent), var(--accent-deep))",
  color: "#fff", border: "none", borderRadius: 0,
  boxShadow: "0 0 14px var(--accent-glow)", cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "9px 18px", fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: 12.5,
  background: "var(--surface-input)", border: "1px solid var(--border-2)",
  color: "var(--text-2)", borderRadius: 0, cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "9px 18px", fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: 12.5,
  background: "transparent", border: "none",
  color: "var(--text-2)", borderRadius: 0, cursor: "pointer",
};

const btnCommit: React.CSSProperties = {
  padding: "9px 18px", fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: 12.5,
  background: "var(--gold)", color: "#1a1300", border: "none", borderRadius: 0, cursor: "pointer",
};

const btnDisabled: React.CSSProperties = {
  padding: "9px 18px", fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: 12.5,
  background: "var(--surface-input)", border: "1px solid var(--border-2)",
  color: "var(--text-muted)", borderRadius: 0, opacity: 0.38, cursor: "not-allowed",
};

const btnIcon: React.CSSProperties = {
  width: 38, height: 38, display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "var(--surface-input)", border: "1px solid var(--border-2)",
  color: "var(--accent-light)", borderRadius: 0, cursor: "pointer",
  fontFamily: "var(--font-data)", fontSize: 16,
};

const inputBase: React.CSSProperties = {
  background: "var(--surface-input)", border: "1px solid var(--border-2)",
  padding: "9px 13px", fontSize: 13, color: "var(--text)", borderRadius: 0,
  fontFamily: "var(--font-ui)", outline: "none",
};

const checkboxStyle: React.CSSProperties = {
  width: 18, height: 18, borderRadius: 0, accentColor: "var(--accent)",
};

const radioStyle: React.CSSProperties = {
  width: 18, height: 18, accentColor: "var(--accent)",
};

const chipActive: React.CSSProperties = {
  padding: "8px 14px", fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 600,
  background: "var(--accent-dim)", color: "var(--accent-light)",
  border: "1px solid var(--accent-50)", borderRadius: 0, cursor: "pointer",
};

const chipInactive: React.CSSProperties = {
  padding: "8px 14px", fontFamily: "var(--font-ui)", fontSize: 12,
  background: "var(--surface-2)", color: "var(--text-muted)",
  border: "1px solid var(--border)", borderRadius: 0, cursor: "pointer",
};

const chipCategory: React.CSSProperties = {
  ...chipInactive, display: "inline-flex", alignItems: "center", gap: 6,
};

function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, filter: `drop-shadow(0 0 5px ${color})`, display: "inline-block" }} />;
}

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 34, height: 18, borderRadius: 9,
      background: on ? "var(--accent-50)" : "rgba(255,255,255,.08)",
      position: "relative", cursor: "pointer", transition: "background .15s",
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: "50%",
        background: on ? "var(--accent-light)" : "var(--text-faint)",
        position: "absolute", top: 2,
        left: on ? 18 : 2, transition: "left .15s",
      }} />
    </div>
  );
}

function StatBarDemo({ label, value }: { label: string; value: number }) {
  const color = value >= 66 ? "var(--grade-c)" : value >= 33 ? "var(--grade-b)" : "var(--grade-a)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 2, width: 56 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.05)", borderRadius: 0, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "var(--grade)", opacity: 0.1 }} />
        <div style={{ height: "100%", width: `${value}%`, background: color, boxShadow: `0 0 7px ${color}`, borderRadius: 0 }} />
      </div>
      <span style={{ fontFamily: "var(--font-data)", fontSize: 12, fontWeight: 700, width: 36, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--surface-1)", border: "1px solid var(--border)",
  borderRadius: 0, padding: 16,
};
