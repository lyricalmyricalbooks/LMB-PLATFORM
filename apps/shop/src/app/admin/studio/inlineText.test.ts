import { describe, expect, it } from "vitest";
import { applyInlineText } from "./inlineText";
import { setPath } from "./studioModel";
const schema = {
  sectionFields: () => [{key:"title",kind:"text"}, {key:"body",kind:"html"}],
  blockFields: () => [{key:"title",kind:"text"}], blocksKey: () => "blocks",
  copyKeys: ["footerNavHeading"], styleKeys: ["announcementText"],
  applyStyle: (design:any, key:string, value:string) => setPath(design, key, value),
};
const design = {
  other: 123,
  heroPage: { sections: [{ id: "s", type: "Test", settings: {
    title: "Before", body: "<b>Formatted</b>", blocks: [{ id: "b", title: "Block" }],
  } }] },
  copy: { footerNavHeading: "Navigate" },
};
describe("atomic preview text commits", () => {
  it("updates current section content without replacing unrelated newer edits", () => {
    const next=applyInlineText({...design,other:456},{kind:"section",sectionId:"s",key:"title",value:"After"},schema);
    expect(next.heroPage.sections[0].settings.title).toBe("After"); expect(next.other).toBe(456);
    expect(design.heroPage.sections[0].settings.title).toBe("Before");
  });
  it("edits nested blocks and rejects formatted or unknown fields", () => {
    const next=applyInlineText(design,{kind:"section",sectionId:"s",blockId:"b",key:"title",value:"Changed block"},schema);
    expect(next.heroPage.sections[0].settings.blocks[0].title).toBe("Changed block");
    expect(applyInlineText(design,{kind:"section",sectionId:"s",key:"body",value:"Flattened"},schema)).toBe(design);
    expect(applyInlineText(design,{kind:"copy",key:"notAllowed",value:"X"},schema)).toBe(design);
  });
  it("updates shared sources while preserving placement and works on global sections", () => {
    const shared={ globalSections:[{id:"global",type:"Test",settings:{blocks:[{id:"placement",sharedBlockId:"source",grid:{desktop:{column:3}}}]}}], sharedBlocks:[{id:"source",block:{id:"original",title:"Shared",children:[{id:"child",title:"Nested"}]}}] };
    const next=applyInlineText(shared,{kind:"section",sectionId:"global",blockId:"placement",key:"title",value:"New shared"},schema);
    expect(next.sharedBlocks[0].block.title).toBe("New shared"); expect(next.globalSections).toBe(shared.globalSections);
    const nested=applyInlineText(shared,{kind:"section",sectionId:"global",blockId:"child",key:"title",value:"New nested"},schema);
    expect(nested.sharedBlocks[0].block.children[0].title).toBe("New nested");
  });
  it("follows inherited children linked to another source without creating local overrides", () => {
    const shared = { globalSections: [{id:"global",type:"Test",settings:{blocks:[{id:"placement",sharedBlockId:"outer"}]}}],
      sharedBlocks: [{id:"outer",block:{id:"root",children:[{id:"child",sharedBlockId:"inner"}]}},
        {id:"inner",block:{id:"original",title:"Shared inner",children:[{id:"grandchild",title:"Deep text"}]}}] };
    const next = applyInlineText(shared,{kind:"section",sectionId:"global",blockId:"child",key:"title",value:"New inner"},schema);
    expect(next.sharedBlocks[1].block.title).toBe("New inner");
    expect(next.sharedBlocks[0]).toBe(shared.sharedBlocks[0]);
    expect(next.globalSections).toBe(shared.globalSections);
    const deep = applyInlineText(shared,{kind:"section",sectionId:"global",blockId:"grandchild",key:"title",value:"New deep text"},schema);
    expect(deep.sharedBlocks[1].block.children?.[0].title).toBe("New deep text");
    expect(deep.sharedBlocks[0]).toBe(shared.sharedBlocks[0]);
  });
  it("edits whitelisted copy and announcement fields only", () => {
    expect(applyInlineText(design,{kind:"copy",key:"footerNavHeading",value:"Explore"},schema).copy.footerNavHeading).toBe("Explore");
    expect(applyInlineText(design,{kind:"style",key:"announcementText",value:"New release"},schema).announcementText).toBe("New release");
    expect(applyInlineText(design,{kind:"style",key:"price",value:"0"},schema)).toBe(design);
  });
});
