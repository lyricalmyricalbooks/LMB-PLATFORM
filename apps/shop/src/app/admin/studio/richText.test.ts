// @vitest-environment jsdom
import {it,expect} from "vitest";
import {sanitizeRichText,canInlineFormat} from "./richText";
it("preserves supported rich text and removes executable markup and unsafe links",()=>{
 expect(sanitizeRichText('<p style="text-align:center"><strong>Hello</strong> <a href="https://example.com" onclick="bad()">link</a></p><script>bad()</script>')).toBe('<p style="text-align: center;"><strong>Hello</strong> <a href="https://example.com">link</a></p>');
 expect(sanitizeRichText('<a href="javascript:bad()">unsafe</a><img src=x onerror=bad()>')).toBe('<a>unsafe</a>');
});
it("routes unsupported embeds to the inspector rather than destroying content",()=>{
 expect(canInlineFormat('<p><strong>Safe</strong></p>')).toBe(true);
 expect(canInlineFormat('<iframe src="https://example.com"></iframe>')).toBe(false);
 expect(canInlineFormat('<p style="color:red">Styled</p>')).toBe(false);
});

it("commits formatted fields only and sanitizes them at the parent boundary",async()=>{
 const {applyInlineText}=await import("./inlineText");
 const schema={sectionFields:()=>[{key:"html",kind:"html"},{key:"title",kind:"text"}],blockFields:()=>[],blocksKey:()=>"items",copyKeys:[],styleKeys:[],applyStyle:(d:any)=>d};
 const design={heroPage:{sections:[{id:"s",type:"RichTextSection",settings:{html:"<p>Old</p>",title:"Plain"}}]}};
 const next=applyInlineText(design,{kind:"section",sectionId:"s",key:"html",format:"html",value:'<p><b>New</b></p><script>bad()</script>'},schema);
 expect(next.heroPage.sections[0].settings.html).toBe('<p><b>New</b></p>');
 expect(applyInlineText(design,{kind:"section",sectionId:"s",key:"title",format:"html",value:'<b>Wrong type</b>'},schema)).toBe(design);
});
