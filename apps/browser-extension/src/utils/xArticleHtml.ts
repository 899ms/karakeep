export function semanticizeXArticleBlocks(root: Element): void {
  for (const block of root.querySelectorAll("div.longform-unstyled")) {
    const paragraph = block.ownerDocument.createElement("p");
    for (const attribute of block.attributes) {
      paragraph.setAttribute(attribute.name, attribute.value);
    }
    paragraph.append(...block.childNodes);
    block.replaceWith(paragraph);
  }
}
