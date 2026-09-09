export function semanticizeXArticleBlocks(root: Element): void {
  for (const wrapper of root.querySelectorAll(
    "div.public-DraftStyleDefault-block",
  )) {
    wrapper.replaceWith(...wrapper.childNodes);
  }

  for (const block of root.querySelectorAll("div.longform-unstyled")) {
    const paragraph = block.ownerDocument.createElement("p");
    for (const attribute of block.attributes) {
      paragraph.setAttribute(attribute.name, attribute.value);
    }
    paragraph.append(...block.childNodes);
    block.replaceWith(paragraph);
  }

  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const wrapper = heading.parentElement;
    if (
      wrapper?.tagName === "DIV" &&
      wrapper.children.length === 1 &&
      wrapper.firstElementChild === heading &&
      !wrapper.hasAttribute("data-contents")
    ) {
      wrapper.replaceWith(heading);
    }
  }

  for (const section of root.querySelectorAll("section")) {
    const images = [...section.querySelectorAll("img")];
    if (!images.length) continue;
    const figure = section.ownerDocument.createElement("figure");
    figure.append(...images);
    section.replaceWith(figure);
  }

  for (const element of root.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (
        attribute.name === "class" ||
        attribute.name === "style" ||
        attribute.name === "contenteditable" ||
        attribute.name === "dir" ||
        attribute.name === "draggable" ||
        attribute.name === "role" ||
        attribute.name === "tabindex" ||
        attribute.name.startsWith("aria-") ||
        attribute.name.startsWith("data-")
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent || "";
  if (node.nodeType !== 1) return "";

  const element = node as HTMLElement;
  const content = [...node.childNodes].map(inlineMarkdown).join("");
  if (element.tagName === "IMG") {
    const image = element as HTMLImageElement;
    return `![${image.alt || "X media"}](${image.currentSrc || image.src})`;
  }
  if (element.tagName === "A") {
    const link = element as HTMLAnchorElement;
    if (link.querySelector("img")) return content;
    return `[${content.trim() || link.href}](${link.href})`;
  }
  if (element.tagName === "STRONG" || element.tagName === "B") {
    return `**${content.trim()}**`;
  }
  if (element.tagName === "EM" || element.tagName === "I") {
    return `*${content.trim()}*`;
  }
  if (element.tagName === "CODE") return `\`${content.trim()}\``;
  if (element.tagName === "BR") return "\n";
  return content;
}

function blockMarkdown(element: Element): string {
  const tag = element.tagName;
  const inline = inlineMarkdown(element)
    .replace(/[ \t]+/g, " ")
    .trim();
  if (/^H[1-6]$/.test(tag)) {
    return `${"#".repeat(Number(tag.slice(1)))} ${inline}`;
  }
  if (tag === "UL" || tag === "OL") {
    return [...element.children]
      .filter((child) => child.tagName === "LI")
      .map((item, index) =>
        tag === "OL"
          ? `${index + 1}. ${inlineMarkdown(item).trim()}`
          : `- ${inlineMarkdown(item).trim()}`,
      )
      .join("\n");
  }
  if (tag === "BLOCKQUOTE") {
    return inline
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  return inline;
}

export function xArticleBlocksToMarkdown(root: Element): string {
  const body = root.querySelector("[data-contents]") || root;
  return [...body.children]
    .map(blockMarkdown)
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
