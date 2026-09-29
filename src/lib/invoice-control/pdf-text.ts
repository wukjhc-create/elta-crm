/**
 * PDF -> tekst til leverandoerfakturaer (IC12). Bevidst IKKE 'use server'.
 *
 * Fund: pdf-parse er v2 (klasse-API `PDFParse`), men koden kaldte v1-stilen `(mod.default || mod)(buf)`. v2 har
 * ingen default-export, saa kaldet kastede ALTID, blev slugt, og alle PDF'er faldt tilbage til mailens broedtekst.
 * Returnerer '' ved enhver fejl (pipeline maa aldrig vaelte paa en PDF).
 */
interface TextParser { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> }

export async function extractPdfText(buf: Buffer): Promise<string> {
  let parser: TextParser | undefined
  try {
    const { PDFParse } = await import('pdf-parse')
    parser = new PDFParse({ data: new Uint8Array(buf) }) as unknown as TextParser
    const result = await parser.getText()
    return (result?.text || '').trim()
  } catch {
    return ''
  } finally {
    if (parser) await parser.destroy().catch(() => undefined)
  }
}
