import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  throw new Error("GITHUB_EVENT_PATH is missing.");
}

const event = JSON.parse(readFileSync(eventPath, "utf8"));
const issue = event.issue;
if (!issue?.body) {
  throw new Error("Issue body is empty.");
}

const sections = parseIssueForm(issue.body);

const title = requiredField(sections, "Title").replace(/^发布笔记：\s*/, "");
const category = normalizeCategory(requiredField(sections, "Category"));
const description = requiredField(sections, "Description");
const tags = parseTags(requiredField(sections, "Tags"));
const featured = /^true$/i.test(requiredField(sections, "Featured"));
const markdown = stripFrontmatter(stripMarkdownFence(requiredField(sections, "Markdown content")));
const slug = uniqueSlug(category, sections.get("Slug") || title, issue.number);
const destination = join("src", "content", "posts", category, `${slug}.md`);
const pubDatetime = new Date().toISOString();

const frontmatter = [
  "---",
  "author: Bakuma-sea",
  `pubDatetime: ${pubDatetime}`,
  `title: ${yamlString(title)}`,
  `featured: ${featured}`,
  `category: ${yamlString(category)}`,
  "tags:",
  ...tags.map(tag => `  - ${yamlString(tag)}`),
  `description: ${yamlString(description)}`,
  "timezone: Asia/Shanghai",
  "---",
  "",
].join("\n");

mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${frontmatter}${markdown.trim()}\n`, "utf8");

setOutput("title", title);
setOutput("path", destination);
setOutput("url", `/posts/${category}/${slug}/`);

function parseIssueForm(body) {
  const result = new Map();
  let current = null;
  let buffer = [];

  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^###\s+(.+?)\s*$/);
    if (match) {
      flush();
      current = match[1].trim();
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();

  return result;

  function flush() {
    if (!current) return;
    const value = buffer.join("\n").trim();
    result.set(current, value === "_No response_" ? "" : value);
  }
}

function requiredField(sections, name) {
  const value = sections.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required field: ${name}`);
  }
  return value;
}

function normalizeCategory(value) {
  const category = value.trim().toLowerCase();
  const allowed = new Set(["rl", "llm", "agents", "notes"]);
  if (!allowed.has(category)) {
    throw new Error(`Unsupported category: ${value}`);
  }
  return category;
}

function parseTags(value) {
  const tags = value
    .split(/[,，\n]/)
    .map(tag => tag.trim())
    .filter(Boolean);

  if (!tags.length) return ["notes"];
  return [...new Set(tags)];
}

function stripMarkdownFence(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1] : trimmed;
}

function stripFrontmatter(value) {
  return value.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

function uniqueSlug(category, value, issueNumber) {
  const sanitized = slugify(value);
  const base = sanitized || `note-${new Date().toISOString().slice(0, 10)}-${issueNumber}`;

  let candidate = base;
  let index = 2;
  while (existsSync(join("src", "content", "posts", category, `${candidate}.md`))) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function yamlString(value) {
  return JSON.stringify(value);
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  writeFileSync(outputPath, `${name}=${value}\n`, { flag: "a" });
}
