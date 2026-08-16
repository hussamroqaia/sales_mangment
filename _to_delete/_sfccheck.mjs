import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'
import fs from 'node:fs'
for (const f of ['src/pages/visits/index.vue', 'src/pages/visits/[id].vue']) {
  const { descriptor, errors } = parse(fs.readFileSync(f, 'utf8'), { filename: f })
  if (errors.length) { console.log('PARSE FAIL', f, errors[0].message); continue }
  compileScript(descriptor, { id: 'x', inlineTemplate: false })
  const r = compileTemplate({ source: descriptor.template.content, filename: f, id: 'x' })
  console.log(r.errors.length ? 'TEMPLATE FAIL ' + f : 'OK ' + f)
}
