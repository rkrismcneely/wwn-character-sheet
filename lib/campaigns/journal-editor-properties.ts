export type JournalPropertyField = {
  label: string; value: string; kind: "text" | "list" | "number" | "boolean";
  raw?: string; originalLabel?: string; originalValue?: string; originalKind?: string;
};
function unquote(value: string): string {
  if (value.startsWith('"')) { try { const parsed: unknown = JSON.parse(value); if (typeof parsed === "string") return parsed; } catch { /* Preserve unsupported scalars. */ } }
  if (/^'(?:[^']|'')*'$/u.test(value)) return value.slice(1,-1).replace(/''/gu,"'");
  return value;
}
/** Only simple Obsidian properties are editable as fields; other YAML stays intact. */
export function editableJournalProperties(source: string): JournalPropertyField[] | null {
  const match=/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*$/u.exec(source);
  if(!match)return null;
  const fields: JournalPropertyField[]=[];
  for(const line of match[1].split(/\r?\n/u)){
    if(!line.trim())continue;
    const key=/^([^\s:#][^:]*):(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
    if(key){
      const label=unquote(key[1].trim()), raw=key[2]??"";
      if(/[{}]|^\s*[&*!]|\s+#/u.test(raw)||/[:\r\n]/u.test(label)||/^[>|]/u.test(raw))return null;
      let kind: JournalPropertyField["kind"]="text", value=unquote(raw);
      if(/^(true|false)$/iu.test(raw)){kind="boolean";value=raw.toLowerCase();}
      else if(/^-?\d+(?:\.\d+)?$/u.test(raw)){kind="number";value=raw;}
      else if(raw.startsWith("[")){
        try{const list:unknown=JSON.parse(raw);if(!Array.isArray(list)||!list.every(item=>typeof item==="string"||typeof item==="number"))return null;kind="list";value=list.map(String).join("\n");}
        catch{if(!/^\[(?:[A-Za-z0-9 _.-]+(?:,\s*[A-Za-z0-9 _.-]+)*)?\]$/u.test(raw))return null;kind="list";value=raw.slice(1,-1).split(",").map(part=>part.trim()).filter(Boolean).join("\n");}
      }
      fields.push({label,value,kind,raw:line,originalLabel:label,originalValue:value,originalKind:kind});
    }else if(/^[ \t]*-\s+/u.test(line)&&fields.length){
      const last=fields.at(-1)!;
      if(last.kind!=="list"&&last.value!=="")return null;
      const item=unquote(line.replace(/^[ \t]*-\s+/u,""));
      if(/^(?:\{|\[)/u.test(item)&&!/^\[\[[^\]\n]+\]\]$/u.test(item))return null;
      last.kind="list";last.value+=(last.value?"\n":"")+item;last.raw+="\n"+line;
      last.originalKind="list";last.originalValue=last.value;
    }else return null;
  }
  return fields.length?fields:null;
}
export function writeJournalProperties(fields: JournalPropertyField[]): string {
  const labels=new Set<string>();
  const rows=fields.map(field=>{
    const label=field.label.trim();
    if(!label||/[:\r\n]/u.test(label))throw new Error("Give each property a label without colons or line breaks.");
    if(labels.has(label.toLowerCase()))throw new Error("Each property needs a different label.");
    labels.add(label.toLowerCase());
    if(/<!--\s*gm-only:/iu.test(field.value))throw new Error("Use a GM-only block for secret content.");
    if(field.raw&&label===field.originalLabel&&field.value===field.originalValue&&field.kind===field.originalKind)return field.raw;
    const key=JSON.stringify(label);
    if(field.kind==="list") {const values=field.value.split(/\r?\n/u).filter(Boolean);return values.length?key+":\n"+values.map(value=>"  - "+JSON.stringify(value)).join("\n"):key+": []";}
    if(field.kind==="number") {const number=Number(field.value);if(!field.value.trim()||!Number.isFinite(number))throw new Error("Enter a valid number for "+label+".");return key+": "+String(number);}
    if(field.kind==="boolean")return key+": "+(field.value==="true"?"true":"false");
    return key+": "+JSON.stringify(field.value);
  });
  return rows.length?"---\n"+rows.join("\n")+"\n---\n":"";
}
