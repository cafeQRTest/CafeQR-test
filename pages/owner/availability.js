//pages/owner/availability.js

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useRestaurant } from "../../context/RestaurantContext";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { getSupabase } from "../../services/supabase";

const DAYS = [
  { label: "Mon", dow: 1 },
  { label: "Tue", dow: 2 },
  { label: "Wed", dow: 3 },
  { label: "Thu", dow: 4 },
  { label: "Fri", dow: 5 },
  { label: "Sat", dow: 6 },
  { label: "Sun", dow: 7 },
];

function defaultHours() {
  return DAYS.map((d) => ({
    dow: d.dow,
    label: d.label,
    open: "10:00",
    close: "22:00",
    enabled: true,
  }));
}

export default function AvailabilityPage() {
  const supabase = getSupabase();
  const { checking } = useRequireAuth(supabase);
  const { restaurant, loading: loadingRestaurant, refresh } = useRestaurant();

  const [hours, setHours] = useState(defaultHours());
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const restaurantId = restaurant?.id || "";

  useEffect(() => {
    if (restaurant) setPaused(!!restaurant.online_paused);
  }, [restaurant]);

  useEffect(() => {
    if (!restaurantId || checking || loadingRestaurant || !supabase) return;
    const load = async () => {
      setLoading(true);
      setErr("");
      try {
        const { data, error } = await supabase
          .from("restaurant_hours")
          .select("dow, open_time, close_time, enabled")
          .eq("restaurant_id", restaurantId)
          .order("dow");
        if (error) throw error;

        if (!data || data.length === 0) {
          setHours(defaultHours());
        } else {
          const mapped = DAYS.map((d) => {
            const row = data.find((r) => r.dow === d.dow);
            if (!row)
              return {
                dow: d.dow,
                label: d.label,
                open: "10:00",
                close: "22:00",
                enabled: true,
              };
            return {
              dow: d.dow,
              label: d.label,
              open: toHHMM(row.open_time),
              close: toHHMM(row.close_time),
              enabled: !!row.enabled,
            };
          });
          setHours(mapped);
        }
      } catch (e) {
        setErr(e.message || "Failed to load hours");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [restaurantId, checking, loadingRestaurant, supabase]);

  const enabledCount = useMemo(
    () => hours.filter((h) => h.enabled).length,
    [hours]
  );

  if (checking || loadingRestaurant)
    return <div style={{ padding: 24 }}>Loading…</div>;
  if (!restaurantId) return <div style={{ padding: 24 }}>No restaurant found.</div>;

  const togglePause = async () => {
    if (!supabase) return;
    setSaving(true);
    setErr("");
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ online_paused: !paused })
        .eq("id", restaurantId);
      if (error) throw error;
      setPaused((prev) => !prev);
      refresh?.();
    } catch (e) {
      setErr(e.message || "Failed to update pause state");
    } finally {
      setSaving(false);
    }
  };

  const setRow = (dow, patch) => {
    setHours((prev) => prev.map((h) => (h.dow === dow ? { ...h, ...patch } : h)));
  };

  const setAll = (patch) => {
    setHours((prev) => prev.map((h) => ({ ...h, ...patch })));
  };

  const copyRowDown = (dow) => {
    const row = hours.find((h) => h.dow === dow);
    if (!row) return;
    setHours((prev) =>
      prev.map((h) =>
        h.dow > dow
          ? { ...h, open: row.open, close: row.close, enabled: row.enabled }
          : h
      )
    );
  };

  const saveHours = async () => {
    if (!supabase) return;
    setSaving(true);
    setErr("");
    try {
      const rows = hours.map((h) => ({
        restaurant_id: restaurantId,
        dow: h.dow,
        open_time: h.open,
        close_time: h.close,
        enabled: h.enabled,
      }));
      for (const r of rows) {
        const { error } = await supabase
          .from("restaurant_hours")
          .upsert(r, { onConflict: "restaurant_id,dow" });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e.message || "Failed to save hours");
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <Container>
      <h1>Store Availability</h1>

      {err && (
        <StyledCard>
          <ErrorText>{err}</ErrorText>
        </StyledCard>
      )}

      <Row justify="space-between" gap="8px" wrap>
        <Muted>{enabledCount} of 7 days enabled</Muted>
        <Row gap="8px" wrap>
          <Button variant="success" onClick={() => setAll({ enabled: true })}>
            Enable All
          </Button>
          <Button variant="outline" onClick={() => setAll({ enabled: false })}>
            Disable All
          </Button>
        </Row>
      </Row>

      <Card padding={16}>
        <PauseSection>
          <label>
            <input
              type="checkbox"
              checked={paused}
              onChange={togglePause}
              disabled={saving}
            />
            <span>
              <strong>Pause online ordering</strong> {saving && "…"}
            </span>
          </label>
          <Muted>
            When paused, customers can view the menu but cannot place new
            orders.
          </Muted>
        </PauseSection>

        <Row gap="8px" wrap>
          <Button
            variant="outline"
            onClick={() =>
              setAll({ open: "10:00", close: "22:00", enabled: true })
            }
          >
            Set All to 10:00–22:00
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setAll({ open: "09:00", close: "21:00", enabled: true })
            }
          >
            Set All to 09:00–21:00
          </Button>
        </Row>

        <TableWrapper>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Enabled</th>
                <th>Opens</th>
                <th>Closes</th>
                <th className="hide-sm">Quick</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.dow}>
                  <td>
                    <strong>{h.label}</strong>
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) =>
                          setRow(h.dow, { enabled: e.target.checked })
                        }
                      />
                      <span className="muted">Open</span>
                    </label>
                  </td>
                  <td>
                    <TimeInput
                      type="time"
                      value={h.open}
                      onChange={(e) => setRow(h.dow, { open: e.target.value })}
                      disabled={!h.enabled}
                    />
                  </td>
                  <td>
                    <TimeInput
                      type="time"
                      value={h.close}
                      onChange={(e) => setRow(h.dow, { close: e.target.value })}
                      disabled={!h.enabled}
                    />
                  </td>
                  <td className="hide-sm">
                    <Row gap="6px" wrap>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyRowDown(h.dow)}
                      >
                        Copy ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setRow(h.dow, {
                            open: "09:00",
                            close: "21:00",
                            enabled: true,
                          })
                        }
                      >
                        9–21
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setRow(h.dow, {
                            open: "10:00",
                            close: "22:00",
                            enabled: true,
                          })
                        }
                      >
                        10–22
                      </Button>
                    </Row>
                  </td>
                </tr>
              ))}
              {hours.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    No rows. Use Set All to quickly initialize hours.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrapper>

        <Row justify="flex-end" gap="8px" wrap style={{ marginTop: 12 }}>
          <Button variant="outline" onClick={() => setHours(defaultHours())}>
            Reset
          </Button>
          <Button onClick={saveHours} disabled={saving}>
            {saving ? "Saving…" : "Save Hours"}
          </Button>
        </Row>
      </Card>
    </Container>
  );
}

/* ---------------- Styled Components ---------------- */

const Container = styled.div`
  width: 100%;
  padding: 0 12px;
  box-sizing: border-box;
  overflow-x: hidden;
`;

const StyledCard = styled(Card)`
  border-color: #fecaca;
  background: #fff1f2;
  margin-bottom: 12px;
`;

const ErrorText = styled.div`
  color: #b91c1c;
`;

const Row = styled.div`
  display: flex;
  justify-content: ${(p) => p.justify || "flex-start"};
  gap: ${(p) => p.gap || "0"};
  flex-wrap: ${(p) => (p.wrap ? "wrap" : "nowrap")};
`;

const Muted = styled.div`
  color: #6b7280;
  font-size: 14px;
`;

const PauseSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin-top: 12px;

  table {
    width: 100%;
    min-width: 800px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 10px;
    text-align: left;
  }

  @media (max-width: 768px) {
    .hide-sm {
      display: none;
    }
    table {
      min-width: 100%;
    }
  }
`;

const TimeInput = styled.input`
  width: 100%;
  max-width: 120px;
  min-width: 80px;
  height: 32px;
  font-size: 14px;
  border: 1px solid #d6d6d6;
  border-radius: 4px;
  padding: 4px;
  color: #000;
  &:focus {
    outline: none;
    border-color: #888;
  }

  @media (max-width: 768px) {
    max-width: 100%;
  }
`;

/* ---------------- Helpers ---------------- */
function toHHMM(value) {
  if (!value) return "00:00";
  const str = String(value);
  const [hh, mm] = str.split(":");
  return `${hh.padStart(2, "0")}:${(mm || "00").padStart(2, "0")}`;
}
