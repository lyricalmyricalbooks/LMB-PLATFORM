import { describe, it, expect } from "vitest";
import { applyContextAction, applySpacing, spacingKey, contextCapabilities } from "./canvasTools";
const design = { globalSections: [{id:"a",type:"Test",settings:{paddingTop:20,blocks:[{id:"group",children:[{id:"b",title:"Text"},{id:"c"}]}]}},{id:"z",type:"Test",settings:{}}], newer:42 };
const key = () => "blocks";
describe("canvas tools", () => {
 it("moves sections and nested siblings without disturbing newer state", () => {
  const next=applyContextAction(design,{sectionId:"a",action:"down"},key);
  expect(next.globalSections.map(s=>s.id)).toEqual(["z","a"]); expect(next.newer).toBe(42);
  const block=applyContextAction(design,{sectionId:"a",blockId:"b",action:"down"},key);
  expect(block.globalSections[0].settings.blocks[0].children.map(b=>b.id)).toEqual(["c","b"]);
 });
 it("duplicates nested placements with fresh descendant ids and supports hide/delete", () => {
  const next=applyContextAction(design,{sectionId:"a",blockId:"group",action:"duplicate"},key);
  const blocks=next.globalSections[0].settings.blocks;expect(blocks).toHaveLength(2);expect(blocks[1].id).not.toBe("group");expect(blocks[1].children[0].id).not.toBe("b");
  expect(applyContextAction(design,{sectionId:"a",blockId:"b",action:"hide"},key).globalSections[0].settings.blocks[0].children[0].hidden).toBe(true);
  expect(applyContextAction(design,{sectionId:"a",action:"delete"},key).globalSections).toHaveLength(1);
  expect(design.globalSections).toHaveLength(2);
 });
 it("preserves legacy block arrays when duplicating sections",()=>{
  const legacy={heroPage:{sections:[{id:"old",type:"FAQSection",settings:{blocks:[{id:"q",question:"Hello"}]}}]}};
  const next=applyContextAction(legacy,{sectionId:"old",action:"duplicate"},()=>"items");
  expect(next.heroPage.sections[1].settings.items).toBeUndefined();
  expect(next.heroPage.sections[1].settings.blocks[0].question).toBe("Hello");
  expect(next.heroPage.sections[1].settings.blocks[0].id).not.toBe("q");
 });
 it("exposes only applicable structural actions", () => {
  expect(contextCapabilities(design,"a",undefined,key)).toMatchObject({up:false,down:true});
  expect(contextCapabilities(design,"a","missing",key)).toBeNull();
 });
 it("writes bounded spacing to the selected device without changing desktop values", () => {
  expect(spacingKey("paddingLeft","mobile")).toBe("mobilePaddingLeft");
  const next=applySpacing(design,{sectionId:"a",key:"paddingTop",device:"mobile",value:36},["paddingTop"]);
  expect(next.globalSections[0].settings).toMatchObject({paddingTop:20,mobilePaddingTop:36});
  expect(applySpacing(design,{sectionId:"a",key:"price",device:"desktop",value:4},["paddingTop"])).toBe(design);
  expect(applySpacing(design,{sectionId:"a",key:"paddingTop",device:"desktop",value:Infinity},["paddingTop"])).toBe(design);
 });
});
