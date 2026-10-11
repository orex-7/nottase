/**
 * Utilitários de conteúdo do editor de página (DatabaseView).
 *
 * Após a migração para um editor rico (TipTap/ProseMirror), o conteúdo é
 * armazenado como **HTML** em `values.__content`. Este módulo concentra:
 *  - `markdownToHtml`: converte o markdown simples usado nos modelos de página
 *    (texto puro) para o HTML que o editor entende. Usado apenas na migração de
 *    modelos legados e na aplicação de um modelo à página.
 *  - `htmlToPlainText`: extrai texto puro do HTML (contagens, resumos).
 *  - `countTasksFromHtml`: progresso de tarefas (`x/y`) lido do HTML do editor.
 *  - `countWords`: contagem de palavras a partir de texto puro.
 *
 * Nenhuma dependência externa: as rotinas abaixo são puras e defensivas.
 */

/** Escapa caracteres especiais de HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Aplica formatação inline de markdown (negrito/itálico/tachado/código/link). */
function inlineToHtml(text: string): string {
  let out = escapeHtml(text);
  // Código inline primeiro, para não interpretar o conteúdo interno.
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Negrito, itálico e tachado.
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  // Links [texto](url).
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return out;
}

/**
 * Converte um markdown simples (linha a linha) em HTML compatível com o editor
 * rico. Suporta: títulos `#`..`###`, listas `-`/`*`, tarefas `- [ ]`/`- [x]`,
 * citação `>`, blocos de código (```) e parágrafos.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];

  let paragraph: string[] = [];
  let listType: "ul" | "ol" | "task" | null = null;
  let quote: string[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inlineToHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType === "task" ? "ul" : listType}>`);
      listType = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      html.push(`<blockquote><p>${inlineToHtml(quote.join(" "))}</p></blockquote>`);
      quote = [];
    }
  };

  const openList = (type: "ul" | "ol" | "task") => {
    if (listType === type) return;
    closeList();
    if (type === "task") {
      html.push('<ul data-type="taskList">');
    } else {
      html.push(`<${type}>`);
    }
    listType = type;
  };

  for (const line of lines) {
    // Bloco de código.
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        flushQuote();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Linha vazia → fecha blocos abertos.
    if (!line.trim()) {
      flushParagraph();
      closeList();
      flushQuote();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      flushQuote();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineToHtml(heading[2])}</h${level}>`);
      continue;
    }

    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      flushParagraph();
      flushQuote();
      openList("task");
      const checked = task[1].toLowerCase() === "x";
      html.push(
        `<li data-type="taskItem" data-checked="${checked}"><p>${inlineToHtml(
          task[2],
        )}</p></li>`,
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      flushQuote();
      openList("ul");
      html.push(`<li><p>${inlineToHtml(bullet[1])}</p></li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      flushQuote();
      openList("ol");
      html.push(`<li><p>${inlineToHtml(ordered[1])}</p></li>`);
      continue;
    }

    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      closeList();
      quote.push(quoted[1]);
      continue;
    }

    // Linha comum.
    closeList();
    flushQuote();
    paragraph.push(line.trim());
  }

  if (inCode && codeBuffer.length) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  closeList();
  flushQuote();

  return html.join("");
}

/** Extrai texto puro de um HTML (remove tags e decodifica entidades básicas). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Contagem de tarefas concluídas/total a partir do HTML do editor. */
export function countTasksFromHtml(html: string): { done: number; total: number } {
  const matches = html.match(
    /data-type="taskItem"[^>]*data-checked="(true|false)"/g,
  );
  if (!matches) return { done: 0, total: 0 };
  const done = matches.filter((m) => m.includes('"true"')).length;
  return { done, total: matches.length };
}

/** Contagem de palavras (ignora espaços em branco). */
export function countWords(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Garante que o conteúdo esteja em HTML. Conteúdo legado (texto/markdown puro)
 * é convertido; conteúdo que já contém tags HTML (templates salvos após a
 * migração para o editor rico) é devolvido como está. Isso torna a conversão
 * idempotente e compatível com modelos antigos e novos.
 */
export function ensureHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  // Já parece HTML (tem alguma tag conhecida do editor).
  if (
    /<\/?(p|h[1-3]|ul|ol|li|blockquote|pre|code|strong|em|s|a|br|hr|img)\b/i.test(
      trimmed,
    )
  ) {
    return content;
  }
  return markdownToHtml(content);
}

