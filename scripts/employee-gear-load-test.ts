/** En fejlet udstyrs- eller certifikatliste er ikke tom. Opret og den aegte tomme tekst bliver. Koer: npx tsx scripts/employee-gear-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/employees/employee-equipment-certificates-editor.tsx', 'utf8')
const equip = src.slice(src.indexOf('export function EmployeeEquipmentEditor'), src.indexOf('export function EmployeeCertificatesEditor'))
const cert = src.slice(src.indexOf('export function EmployeeCertificatesEditor'))
eq('udstyr findes', equip.includes('listEquipment'), true)
eq('udstyr-fejl', equip.includes('data-testid="equipment-load-error"') && equip.includes('Udstyr kunne ikke hentes. Det tælles ikke som intet udstyr.'), true)
eq('udstyr-fejl to gange', equip.split('Udstyr kunne ikke hentes. Det tælles ikke som intet udstyr.').length - 1 === 2, true)
eq('udstyr saetter kun ved succes', equip.includes('if (r.success && r.data) { setItems(r.data); setLoadError(null) }'), true)
eq('intet udstyr bliver', equip.includes('Intet udstyr endnu.'), true)
eq('tom kun uden fejl', equip.includes('items.length === 0 && !loadError'), true)
eq('opret udstyr bliver', equip.includes('createEquipment(employeeId'), true)

eq('certifikat-fejl', cert.includes('data-testid="certificate-load-error"') && cert.includes('Certifikater kunne ikke hentes. Det tælles ikke som ingen certifikater.'), true)
eq('certifikat-fejl to gange', cert.split('Certifikater kunne ikke hentes. Det tælles ikke som ingen certifikater.').length - 1 === 2, true)
eq('ingen certifikater bliver', cert.includes('Ingen certifikater endnu.'), true)
eq('opret certifikat bliver', cert.includes('createCertificate(employeeId'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nemployee-gear-load-test OK')
process.exitCode = fail ? 1 : 0
