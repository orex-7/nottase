"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteEvent, updateEvent } from "@/lib/events";
import { eventCreateSchema } from "@/lib/validations";
import { cn } from "@/lib/utils";
import type { CalendarEvent, EventFormValues } from "@/types/event";

const COLOR_OPTIONS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const AUTOSAVE_DELAY = 700;

type Status = "idle" | "saving" | "saved" | "error" | "invalid";

interface EventDetailsProps {
  event: CalendarEvent;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (eventId: string) => void;
  onClose: () => void;
}

function toFormValues(event: CalendarEvent): EventFormValues {
  return {
    title: event.title,
    description: event.description ?? "",
    date: event.date,
    endDate: event.endDate ?? event.date,
    allDay: event.allDay,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "10:00",
    color: event.color,
  };
}

export function EventDetails({
  event,
  onSaved,
  onDeleted,
  onClose,
}: EventDetailsProps) {
  const [values, setValues] = useState<EventFormValues>(() =>
    toFormValues(event),
  );
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [deleting, setDeleting] = useState(false);

  // Evita salvar estados parciais quando o evento selecionado muda.
  const eventIdRef = useRef(event.id);
  const savedTimer = useRef<number | null>(null);
  // Ignora o primeiro ciclo do autosave (estado inicial, sem alterações).
  const dirtyRef = useRef(false);

  // Reinicia o formulário ao trocar de evento.
  useEffect(() => {
    if (eventIdRef.current === event.id) return;
    eventIdRef.current = event.id;
    dirtyRef.current = false;
    setValues(toFormValues(event));
    setErrors({});
    setStatus("idle");
  }, [event]);

  // Salvamento automático com debounce após cada alteração.
  useEffect(() => {
    if (!dirtyRef.current) return;

    const parsed = eventCreateSchema.safeParse(values);

    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors);
      setStatus("invalid");
      return;
    }

    setErrors({});
    setStatus("saving");

    const id = window.setTimeout(async () => {
      try {
        const saved = await updateEvent(event.id, {
          title: parsed.data.title,
          description: parsed.data.description || null,
          date: parsed.data.date,
          endDate: parsed.data.endDate || null,
          allDay: parsed.data.allDay,
          startTime: parsed.data.allDay ? null : parsed.data.startTime ?? null,
          endTime: parsed.data.allDay ? null : parsed.data.endTime ?? null,
          color: parsed.data.color,
        });
        onSaved(saved);
        setStatus("saved");
        savedTimer.current = window.setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, AUTOSAVE_DELAY);

    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, []);

  const update = <K extends keyof EventFormValues>(
    key: K,
    value: EventFormValues[K],
  ) => {
    dirtyRef.current = true;
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Mantém a data de término >= data de início.
      if (key === "date" && typeof value === "string" && next.endDate < value) {
        next.endDate = value;
      }
      return next;
    });
  };

  async function handleDelete() {
    if (!window.confirm("Excluir este evento?")) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      onDeleted(event.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b pb-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {status === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Salvando…
            </>
          ) : status === "saved" ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" />
              Salvo
            </>
          ) : status === "error" ? (
            <span className="text-destructive">Erro ao salvar</span>
          ) : status === "invalid" ? (
            <span className="text-warning">Preencha os campos</span>
          ) : (
            "Edição automática"
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto py-3">
        <div className="space-y-1.5">
          <Label htmlFor="details-title">Título</Label>
          <Input
            id="details-title"
            value={values.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Ex.: Reunião de equipe"
          />
          {errors.title ? (
            <p className="text-xs text-destructive">{errors.title[0]}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="details-description">Descrição</Label>
          <Textarea
            id="details-description"
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="details-date">Data de início</Label>
            <Input
              id="details-date"
              type="date"
              value={values.date}
              onChange={(e) => update("date", e.target.value)}
            />
            {errors.date ? (
              <p className="text-xs text-destructive">{errors.date[0]}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="details-endDate">Data de término</Label>
            <Input
              id="details-endDate"
              type="date"
              value={values.endDate}
              min={values.date}
              onChange={(e) => update("endDate", e.target.value)}
            />
            {errors.endDate ? (
              <p className="text-xs text-destructive">{errors.endDate[0]}</p>
            ) : null}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.allDay}
            onChange={(e) => update("allDay", e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Dia inteiro
        </label>

        {!values.allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="details-startTime">Início</Label>
              <Input
                id="details-startTime"
                type="time"
                value={values.startTime}
                onChange={(e) => update("startTime", e.target.value)}
              />
              {errors.startTime ? (
                <p className="text-xs text-destructive">
                  {errors.startTime[0]}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="details-endTime">Fim</Label>
              <Input
                id="details-endTime"
                type="time"
                value={values.endTime}
                onChange={(e) => update("endTime", e.target.value)}
              />
              {errors.endTime ? (
                <p className="text-xs text-destructive">{errors.endTime[0]}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Cor ${color}`}
                onClick={() => update("color", color)}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                  values.color === color
                    ? "border-foreground"
                    : "border-transparent",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-t pt-3">
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting}
          className="w-full"
        >
          {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Excluir
        </Button>
      </div>
    </div>
  );
}
