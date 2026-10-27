import {it,expect} from "vitest";
import {sectionSpacingCss} from "./sectionSpacing";
it("targets the actual content padding once and scopes phone/tablet gap overrides",()=>{
 const css=sectionSpacingCss("safe",{paddingTop:24,mobilePaddingLeft:12,tabletPaddingTop:40,mobileGridGap:16});
 expect(css).toContain(':has([data-studio-spacing])');expect(css).toContain('padding-top:0!important');
 expect(css).toContain('padding-left:12px!important');expect(css).toContain('(max-width:1023px)');expect(css).toContain('[data-studio-gap="gridGap"]');
 expect(sectionSpacingCss('safe',{mobilePaddingTop:'bad'})).not.toContain('NaN');
});
