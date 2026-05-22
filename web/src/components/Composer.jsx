import { Button, Input, Space, Upload } from 'antd';
import { PaperClipOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';

const templates = [
  ['解释代码', '解释这段代码，说明核心逻辑、输入输出和潜在风险：'],
  ['找 bug', '帮我检查这段代码的 bug，按严重程度列出问题和修复建议：'],
  ['优化', '帮我优化这段内容，保持含义不变，让结构更清晰：'],
  ['总结', '请总结下面内容，给出要点和下一步建议：'],
];

const MAX_TEXT_FILE_BYTES = 512 * 1024;
const supportedExtensions = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonl',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'xml',
  'csv',
  'yaml',
  'yml',
  'toml',
  'ini',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'go',
  'rs',
  'php',
  'rb',
  'sh',
  'ps1',
  'sql',
  'log',
  'vue',
  'svelte',
]);

const supportedMimeTypes = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
]);

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileExtension(name = '') {
  const clean = name.toLowerCase();
  const dotIndex = clean.lastIndexOf('.');
  return dotIndex >= 0 ? clean.slice(dotIndex + 1) : '';
}

function isTextFile(file) {
  if (file.type?.startsWith('text/')) return true;
  if (supportedMimeTypes.has(file.type)) return true;
  return supportedExtensions.has(getFileExtension(file.name));
}

export function Composer({ value, busy, onChange, onSend, onStop, onAttachFile, onAttachError }) {
  function applyTemplate(prefix) {
    const current = value.trim();
    onChange(current ? `${prefix}\n\n${current}` : prefix);
  }

  async function readLocalFile(file) {
    if (!file.size) {
      onAttachError?.('这个文件是空的，暂时没有可加入的内容。');
      return;
    }

    if (file.size > MAX_TEXT_FILE_BYTES) {
      onAttachError?.(`文件太大了，当前先支持 ${formatBytes(MAX_TEXT_FILE_BYTES)} 以内的文本/代码文件。`);
      return;
    }

    if (!isTextFile(file)) {
      onAttachError?.('当前先支持文本、代码、Markdown、JSON、CSV 这类文件；图片和 PDF 后面按模型能力单独接。');
      return;
    }

    try {
      const content = await file.text();
      if (content.includes('\u0000')) {
        onAttachError?.('这个文件看起来像二进制内容，暂时不会加入上下文。');
        return;
      }

      onAttachFile?.({
        name: file.name,
        size: file.size,
        type: file.type || 'text/plain',
        content,
      });
    } catch {
      onAttachError?.('文件读取失败，可以换一个文本文件再试。');
    }
  }

  function beforeUpload(file) {
    void readLocalFile(file);
    return Upload.LIST_IGNORE;
  }

  return (
    <form className="composer" onSubmit={(event) => {
      event.preventDefault();
      onSend();
    }}>
      <Space className="composer-toolbar" wrap size={8}>
        {templates.map(([label, prompt]) => (
          <Button key={label} size="small" onClick={() => applyTemplate(prompt)}>
            {label}
          </Button>
        ))}
        <Upload
          accept=".txt,.md,.markdown,.json,.jsonl,.js,.mjs,.cjs,.jsx,.ts,.mts,.cts,.tsx,.css,.scss,.less,.html,.htm,.xml,.csv,.yaml,.yml,.toml,.ini,.py,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.php,.rb,.sh,.ps1,.sql,.log,.vue,.svelte,text/*,application/json,application/xml,application/yaml"
          beforeUpload={beforeUpload}
          disabled={busy}
          multiple
          showUploadList={false}
        >
          <Button size="small" icon={<PaperClipOutlined />} disabled={busy}>
            上传文件
          </Button>
        </Upload>
      </Space>

      <div className="composer-input-row">
        <Input.TextArea
          value={value}
          autoSize={{ minRows: 3, maxRows: 9 }}
          placeholder="输入内容"
          onChange={(event) => onChange(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <div className="composer-buttons">
          <Button icon={<StopOutlined />} disabled={!busy} onClick={onStop}>
            停止
          </Button>
          <Button type="primary" htmlType="submit" loading={busy} icon={<SendOutlined />}>
            发送
          </Button>
        </div>
      </div>
    </form>
  );
}
