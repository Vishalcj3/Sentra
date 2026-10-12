import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

// Doctor availability: 10am–6pm, 30-min slots
const SLOT_START = 10; // 10:00
const SLOT_END   = 18; // 18:00

function generateSlots() {
  const slots = [];
  for (let h = SLOT_START; h < SLOT_END; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const ALL_SLOTS = generateSlots();

function formatSlot(time) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Mini calendar helpers
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

/**
 * AppointmentPicker
 * Props:
 *   doctorId   — UID of provider (to check booked slots)
 *   onSelect   — callback({ date: Date, slot: "HH:MM" })
 *   selected   — { date: Date, slot: string } | null
 *   availability — optional string label e.g. "10:00 AM – 6:00 PM"
 */
export default function AppointmentPicker({ doctorId, onSelect, selected, availability = "10:00 AM – 6:00 PM" }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [pickedDate, setPickedDate] = useState(selected?.date || null);
  const [pickedSlot, setPickedSlot] = useState(selected?.slot || null);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Load booked slots whenever doctor + date changes
  useEffect(() => {
    if (!doctorId || !pickedDate) return;
    setLoadingSlots(true);
    const dayStart = new Date(pickedDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(pickedDate); dayEnd.setHours(23, 59, 59, 999);

    getDocs(query(
      collection(db, "appointments"),
      where("providerId", "==", doctorId),
      where("scheduledAt", ">=", dayStart),
      where("scheduledAt", "<=", dayEnd)
    )).then((snap) => {
      const taken = snap.docs.map((d) => {
        const ts = d.data().scheduledAt?.toDate?.() || new Date(d.data().scheduledAt);
        return `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}`;
      });
      setBookedSlots(taken);
    }).finally(() => setLoadingSlots(false));
  }, [doctorId, pickedDate]);

  // Notify parent when both date + slot are chosen
  useEffect(() => {
    if (pickedDate && pickedSlot) {
      const [h, m] = pickedSlot.split(":").map(Number);
      const dt = new Date(pickedDate);
      dt.setHours(h, m, 0, 0);
      onSelect({ date: dt, slot: pickedSlot });
    }
  }, [pickedDate, pickedSlot]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const daysInMonth  = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWk = getFirstDayOfMonth(viewYear, viewMonth);

  const isToday    = (d) => new Date(viewYear, viewMonth, d).toDateString() === new Date().toDateString();
  const isPast     = (d) => new Date(viewYear, viewMonth, d) < today;
  const isSelected = (d) => pickedDate && new Date(viewYear, viewMonth, d).toDateString() === pickedDate.toDateString();

  const selectDay = (d) => {
    if (isPast(d)) return;
    setPickedDate(new Date(viewYear, viewMonth, d));
    setPickedSlot(null); // reset slot when date changes
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Calendar ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        {/* Month nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <button onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", padding: "0 4px" }}>‹</button>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", padding: "0 4px" }}>›</button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "8px 8px 0" }}>
          {DAY_NAMES.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", paddingBottom: 6 }}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 8px 8px", gap: 2 }}>
          {Array(firstDayOfWk).fill(null).map((_, i) => <div key={`e${i}`} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const d = i + 1;
            const past     = isPast(d);
            const today_   = isToday(d);
            const selected_ = isSelected(d);
            return (
              <button
                key={d}
                onClick={() => selectDay(d)}
                disabled={past}
                style={{
                  border: "none",
                  borderRadius: "50%",
                  width: 36, height: 36,
                  margin: "1px auto",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: selected_ ? 700 : 400,
                  cursor: past ? "default" : "pointer",
                  background: selected_
                    ? "var(--primary)"
                    : today_
                    ? "var(--primary-light)"
                    : "transparent",
                  color: selected_
                    ? "#fff"
                    : past
                    ? "var(--border)"
                    : today_
                    ? "var(--primary-dark)"
                    : "var(--text)",
                  transition: "background .15s",
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Time slots ── */}
      {pickedDate && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Available slots · {pickedDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <span style={{ fontSize: 11, background: "var(--accent-tint)", padding: "2px 8px", borderRadius: 20, color: "#047857" }}>
              🕙 {availability}
            </span>
          </div>

          {loadingSlots ? (
            <div style={{ textAlign: "center", padding: 16 }}>
              <div className="spinner" style={{ margin: "0 auto" }} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {ALL_SLOTS.map((slot) => {
                const booked   = bookedSlots.includes(slot);
                const selected_ = pickedSlot === slot;
                return (
                  <button
                    key={slot}
                    disabled={booked}
                    onClick={() => !booked && setPickedSlot(slot)}
                    style={{
                      border: `1px solid ${selected_ ? "var(--primary)" : booked ? "var(--border)" : "var(--border)"}`,
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 4px",
                      fontSize: 12,
                      fontWeight: selected_ ? 600 : 400,
                      background: selected_
                        ? "var(--primary)"
                        : booked
                        ? "var(--bg)"
                        : "var(--surface)",
                      color: selected_
                        ? "#fff"
                        : booked
                        ? "var(--border)"
                        : "var(--text)",
                      cursor: booked ? "not-allowed" : "pointer",
                      textDecoration: booked ? "line-through" : "none",
                      transition: "all .15s",
                    }}
                  >
                    {formatSlot(slot)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
