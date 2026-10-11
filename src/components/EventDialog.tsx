"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateLong, fromDateKey } from "@/lib/date-utils";
import { createEvent, deleteEvent, updateEvent } from "@/lib/events";
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

interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  dateKey: string;
  event: CalendarEvent | null;
  /** Hora inicial sugerida (HH:mm) ao criar um evento em uma célula de horário. */
  initialStartTime?: string | null;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (eventId: string) => void;
}

const emptyForm = (dateKey: string, startTime?: string | null): EventFormValues => {
  const start = startTime ?? null;
  const end = start
    ? `${String((Number(start.split(":")[0]) + 1) % 24).padStart(2, "0")}:${start.split(":")[1]}`
    : "10:00";
  return {
    title: "",
    description: "",
    date: dateKey,
    endDate: dateKey,
    allDay: !start,
    startTime: start ?? "09:00",
    endTime: end,
    color: COLOR_OPTIONS[0],
  };
};

export function EventDialog({
  open,
  onClose,
  dateKey,
  event,
  initialStartTime,
  onSaved,
  onDeleted,
}: EventDialogProps) {
  const [values, setValues] = useState<EventFormValues>(emptyForm(dateKey));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setValues({
        title: event.title,
        description: event.description ?? "",
        date: dateKey,
        endDate: event.endDate ?? dateKey,
        allDay: event.allDay,
        startTime: event.startTime ?? "09:00",
        endTime: event.endTime ?? "10:00",
        color: event.color,
      });
    } else {
      setValues(emptyForm(dateKey, initialStartTime));
    }
    setErrors({});
  }, [open, event, dateKey, initialStartTime]);

  const update = <K extends keyof EventFormValues>(
    key: K,
    value: EventFormValues[K],
  ) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Mantém a data de término >= data de início.
      if (key === "date" && typeof value === "string" && next.endDate < value) {
        next.endDate = value;
      }
      return next;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = eventCreateSchema.safeParse(values);

    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const payload = {
        title: parsed.data.title,
        description: parsed.data.description || null,
        date: parsed.data.date,
        endDate: parsed.data.endDate || null,
        allDay: parsed.data.allDay,
        startTime: parsed.data.allDay ? null : parsed.data.startTime ?? null,
        endTime: parsed.data.allDay ? null : parsed.data.endTime ?? null,
        color: parsed.data.color,
      };

      const saved = event
        ? await updateEvent(event.id, payload)
        : await createEvent(payload);

      onSaved(saved);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Erro ao salvar. Tente novamente.";
      setErrors({ title: [message] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setSubmitting(true);
    try {
      await deleteEvent(event.id);
      onDeleted(event.id);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Erro ao excluir. Tente novamente.";
      setErrors({ title: [message] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>
            {formatDateLong(fromDateKey(dateKey))}
          </DialogDescription>
        </DialogHeader>
        <EventForm
          values={values}
          errors={errors}
          update={update}
          event={event}
          submitting={submitting}
          onClose={onClose}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      </DialogContent>
    </Dialog>
  );
}

interface EventFormProps {
  values: EventFormValues;
  errors: Record<string, string[]>;
  update: <K extends keyof EventFormValues>(
    key: K,
    value: EventFormValues[K],
  ) => void;
  event: CalendarEvent | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: () => void;
}

function EventForm({
  values,
  errors,
  update,
  event,
  submitting,
  onClose,
  onSubmit,
  onDelete,
}: EventFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          value={values.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Ex.: Reunião de equipe"
          autoFocus
        />
        {errors.title ? (
          <p className="text-xs text-destructive">{errors.title[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Opcional"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date">Data de início</Label>
          <Input
            id="date"
            type="date"
            value={values.date}
            onChange={(e) => update("date", e.target.value)}
          />
          {errors.date ? (
            <p className="text-xs text-destructive">{errors.date[0]}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">Data de término</Label>
          <Input
            id="endDate"
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
            <Label htmlFor="startTime">Início</Label>
            <Input
              id="startTime"
              type="time"
              value={values.startTime}
              onChange={(e) => update("startTime", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endTime">Fim</Label>
            <Input
              id="endTime"
              type="time"
              value={values.endTime}
              onChange={(e) => update("endTime", e.target.value)}
            />
          </div>
          {errors.endTime ? (
            <p className="col-span-2 text-xs text-destructive">
              {errors.endTime[0]}
            </p>
          ) : null}
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
                values.color === color ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <DialogFooter className="gap-2">
        {event ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={submitting}
            className="sm:mr-auto"
          >
            <Trash2 />
            Excluir
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

