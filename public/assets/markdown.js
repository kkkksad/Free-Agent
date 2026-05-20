function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function markdownToHtml(markdown) {
  const parts = markdown.split(/```/);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const lines = part.replace(/^\w+\n/, '');
      return `<pre><code>${escapeHtml(lines.trim())}</code></pre>`;
    }

    return part
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => {
        if (/^[-*]\s/m.test(paragraph)) {
          const items = paragraph
            .split('\n')
            .map((line) => line.replace(/^[-*]\s*/, '').trim())
            .filter(Boolean)
            .map((item) => `<li>${inlineMarkdown(item)}</li>`)
            .join('');
          return `<ul>${items}</ul>`;
        }

        if (/^\d+\.\s/m.test(paragraph)) {
          const items = paragraph
            .split('\n')
            .map((line) => line.replace(/^\d+\.\s*/, '').trim())
            .filter(Boolean)
            .map((item) => `<li>${inlineMarkdown(item)}</li>`)
            .join('');
          return `<ol>${items}</ol>`;
        }

        return `<p>${inlineMarkdown(paragraph).replace(/\n/g, '<br>')}</p>`;
      })
      .join('');
  }).join('');
}

export function enhanceCodeBlocks(scope, copyText) {
  for (const pre of scope.querySelectorAll('pre')) {
    if (pre.querySelector('.code-copy')) continue;
    const code = pre.querySelector('code');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.textContent = '复制代码';
    button.addEventListener('click', () => copyText(code?.textContent || pre.textContent || ''));
    pre.prepend(button);
  }
}

export function setBubbleContent(bubble, content, role, copyText) {
  if (role === 'assistant') {
    bubble.innerHTML = markdownToHtml(content || '');
    enhanceCodeBlocks(bubble, copyText);
  } else {
    bubble.textContent = content;
  }
}
