import { SelectField } from "./riso/components";

/** Which sheet of a workbook to read, beside the chosen file's name (plan 23.37). Shows only when there is a choice. */
export function SheetChoice({ sheets, sheet, disabled, onChange }: {
  sheets: string[]; sheet: string; disabled?: boolean; onChange: (sheet: string) => void;
}) {
  if (sheets.length < 2) return null;
  return (
    <SelectField label="Sheet" hideLabel value={sheet} disabled={disabled} style={{ width: "auto", maxWidth: "100%" }}
      onChange={(e) => onChange(e.target.value)}>
      {sheets.map((name) => <option key={name} value={name}>Sheet: {name}</option>)}
    </SelectField>
  );
}
