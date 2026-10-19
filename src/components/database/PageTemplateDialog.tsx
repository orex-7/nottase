"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, LayoutTemplate, Plus, Trash2, X } from "lucide-react";

import { PageEditor } from "@/components/database/PageEditor";
import {
  columnIcon,
  columnTypeMeta,
} from "@/components/database/database-fields";
import {
  RECURRENCE_ENDS,
  RECURRENCE_FREQUENCIES,
  describeRecurrence,
  emptyRecurrence,
} from "@/components/database/database-recurrence-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayISO } from "@/lib/database-recurrence";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_LABELS,
  type Column,
  type PageTemplate,
  type Recurrence,
  type RecurrenceEnd,
  type RecurrenceFrequency,
} from "@/types/database";

interface PageTemplateDialogProps {
  open: boolean;
  /** Elemento ao qual o popover da lista fica ancorado (botão "Criar modelo"). */
  anchorEl?: HTMLElement | null;
  templates: PageTemplate[];
  /** Propriedades da tabela (somente leitura) mostradas no modelo. */
  columns: Column[];
  onCreate: (name: string, content: string, recurrence: Recurrence | null) => void;
  onDelete: (id: string) => void;
  /** Cria um novo item no database a partir do modelo selecionado. */
  onApply: (template: PageTemplate) => void;
  onClose: () => void;
}

/**
 * Modal para criar e gerenciar modelos de página (estilo Notion).
 * Segue o mesmo padrão visual da página do item: overlay centralizado,
 * cabeçalho fixo e corpo com scroll. As propriedades exibidas são as da própria
 * tabela (somente leitura) — o modelo guarda apenas o nome, o conteúdo e a
 * recorrência. Componente de nível de módulo para preservar o estado dos campos
 * entre renders.
 */
export function PageTemplateDialog({
  open,
  anchorEl,
  templates,
  columns,
  onCreate,
  onDelete,
  onApply,
  onClose,
}: PageTemplateDialogProps) {
  const [mode, setMode] = useState<"list" | "create">("list");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  /** Recorrência habilitada para o modelo. */
  const [recEnabled, setRecEnabled] = useState(false);
  /** Configuração de recorrência (frequência, intervalo, dias, término). */
  const [recurrence, setRecurrence] = useState<Recurrence>(() =>
    emptyRecurrence(),
  );
  /** Quando true, o modelo gera itens automaticamente conforme a recorrência. */
  const [autoEnabled, setAutoEnabled] = useState(false);

  // Sempre que o diálogo abre, volta para a lista e limpa o formulário.
  useEffect(() => {
    if (open) {
      setMode("list");
      setName("");
      setContent("");
      setRecEnabled(false);
      setRecurrence(emptyRecurrence());
      setAutoEnabled(false);
    }
  }, [open]);

  /** Posição (top/right) do popover da lista, ancorado ao botão "Criar modelo". */
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Posiciona o popover da lista logo abaixo do botão âncora, alinhado à direita.
  useLayoutEffect(() => {
    if (!open || mode !== "list" || !anchorEl) {
      setPos(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, [open, mode, anchorEl]);

  if (!open) return null;

  const resetForm = () => {
    setName("");
    setContent("");
    setRecEnabled(false);
    setRecurrence(emptyRecurrence());
    setAutoEnabled(false);
  };

  const handleCreate = () => {
    if (!name.trim() && !content.trim()) return;
    const rec =
      recEnabled
        ? {
            ...recurrence,
            // Marca a data de início quando a automação está ligada; é a partir
            // dela que os itens passam a ser criados automaticamente.
            startDate: autoEnabled ? todayISO() : null,
            lastGenerated: null,
          }
        : null;
    onCreate(name, content, rec);
    resetForm();
    setMode("list");
  };

  /** Atualiza parcialmente a configuração de recorrência. */
  const patchRecurrence = (patch: Partial<Recurrence>) => {
    setRecurrence((prev) => ({ ...prev, ...patch }));
  };

  /** Liga/desliga um dia da semana na recorrência semanal. */
  const toggleWeekday = (day: number) => {
    setRecurrence((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b),
    }));
  };

  // Modo "list": popover pequeno ancorado abaixo do botão "Criar modelo".
  // Modo "create": página centralizada (overlay escuro + modal).
  if (mode === "list") {
    return (
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="absolute w-72 rounded-lg border bg-popover p-1 shadow-lg"
          style={pos ? { top: pos.top, right: pos.right } : { top: -9999, right: 0 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Modelos de página"
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <LayoutTemplate className="h-3.5 w-3.5" />
            Modelos de página
          </div>
          <div className="max-h-64 overflow-y-auto">
            {templates.length > 0 ? (
              <ul className="space-y-0.5">
                {templates.map((tpl) => (
                  <li key={tpl.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onApply(tpl)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onApply(tpl);
                        }
                      }}
                      title="Criar um item no database a partir deste modelo"
                      className="group/tpl flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <LayoutTemplate className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
                      {tpl.recurrence ? (
                        <span className="flex-none rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                          {describeRecurrence(tpl.recurrence)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(tpl.id);
                        }}
                        aria-label={`Excluir modelo ${tpl.name}`}
                        title="Excluir modelo"
                        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                      <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                Você ainda não tem modelos.
              </p>
            )}
          </div>
          <div className="mt-0.5 border-t pt-1">
            <Button
              className="w-full"
              size="sm"
              variant="ghost"
              onClick={() => setMode("create")}
            >
              <Plus />
              Criar modelo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-full w-full max-w-[60vw] flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Criar modelo"
      >
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <button
            type="button"
            onClick={() => setMode("list")}
            aria-label="Voltar para a lista de modelos"
            title="Voltar"
            className="flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-base font-semibold">Criar modelo</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {/* Corpo com scroll único (mesmo padrão da página do item): nome,
              propriedades, recorrência e conteúdo rolam juntos. */}
          <div className="flex flex-col space-y-4 pt-4">
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Nome do modelo
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Tarefa padrão"
              />
            </div>

            {/* Propriedades da tabela (somente leitura, mesmo estilo da página do item) */}
            <div className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Propriedades
              </span>
              <div className="flex flex-col divide-y rounded border">
                {columns.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    A tabela ainda não tem propriedades.
                  </p>
                ) : (
                  columns.map((column) => {
                    const meta = columnTypeMeta(column.type);
                    const TypeIcon = columnIcon(column);
                    return (
                      <div
                        key={column.id}
                        className="flex items-center gap-2 px-2 py-1.5"
                      >
                        <TypeIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {column.name}
                        </span>
                        <span className="flex-none text-xs text-muted-foreground">
                          {meta.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* Recorrência (estilo RRULE): frequência, intervalo, dias e término */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Recorrência
                </span>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={recEnabled}
                    onChange={(e) => setRecEnabled(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Repetir
                </label>
              </div>

              {recEnabled ? (
                <div className="space-y-2 rounded border p-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Repetir a cada</span>
                    <Input
                      type="number"
                      min={1}
                      value={recurrence.interval}
                      onChange={(e) =>
                        patchRecurrence({
                          interval: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="h-7 w-16"
                      aria-label="Intervalo da recorrência"
                    />
                    <select
                      value={recurrence.frequency}
                      onChange={(e) =>
                        patchRecurrence({
                          frequency: e.target.value as RecurrenceFrequency,
                        })
                      }
                      className="h-7 rounded border bg-background px-2 text-sm"
                      aria-label="Frequência da recorrência"
                    >
                      {RECURRENCE_FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.noun}
                          {recurrence.interval > 1 ? "s" : ""}{" "}
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {recurrence.frequency === "weekly" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Dias</span>
                      <div className="flex gap-1">
                        {WEEKDAY_LABELS.map((label, day) => {
                          const active = recurrence.weekdays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleWeekday(day)}
                              aria-pressed={active}
                              aria-label={`Dia ${day}`}
                              className={cn(
                                "flex h-[30px] w-[30px] items-center justify-center rounded-full border text-xs",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-accent",
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Termina</span>
                    <select
                      value={recurrence.end}
                      onChange={(e) =>
                        patchRecurrence({ end: e.target.value as RecurrenceEnd })
                      }
                      className="h-7 rounded border bg-background px-2 text-sm"
                      aria-label="Término da recorrência"
                    >
                      {RECURRENCE_ENDS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {recurrence.end === "on" ? (
                      <Input
                        type="date"
                        value={recurrence.endDate ?? ""}
                        onChange={(e) =>
                          patchRecurrence({ endDate: e.target.value })
                        }
                        className="h-7 w-36"
                        aria-label="Data final da recorrência"
                      />
                    ) : null}
                    {recurrence.end === "after" ? (
                      <span className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={recurrence.endCount ?? 1}
                          onChange={(e) =>
                            patchRecurrence({
                              endCount: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="h-7 w-16"
                          aria-label="Número de ocorrências"
                        />
                        <span className="text-muted-foreground">ocorrências</span>
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {describeRecurrence(recurrence)}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Horário</span>
                    <Input
                      type="time"
                      value={recurrence.time ?? ""}
                      onChange={(e) =>
                        patchRecurrence({ time: e.target.value || null })
                      }
                      className="h-7 w-28"
                      aria-label="Horário da recorrência"
                    />
                    {recurrence.time ? null : (
                      <span className="text-xs text-muted-foreground">
                        (vazio = dia inteiro)
                      </span>
                    )}
                  </div>

                  <label className="flex cursor-pointer items-start gap-2 rounded border bg-muted/30 p-2 text-xs">
                    <input
                      type="checkbox"
                      checked={autoEnabled}
                      onChange={(e) => setAutoEnabled(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                    />
                    <span className="text-muted-foreground">
                      Criar itens automaticamente. Ao abrir o app, um item novo é
                      criado no database para cada ocorrência que &quot;venceu&quot;,
                      usando este modelo. {autoEnabled ? "Ativo desde hoje." : ""}
                    </span>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Conteúdo da página
              </label>
              <PageEditor
                value={content}
                onChange={setContent}
                placeholder="Escreva o conteúdo que será aplicado à página do item..."
                ariaLabel="Conteúdo do modelo"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode("list")}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCreate}>
                <Plus />
                Criar modelo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
