/**
 * Roof Drawings Types
 *
 * Målfast solpanel-tegneflade til besigtigelser: et uploadet tagbillede med
 * en målestok (referencelinje af kendt længde) og placerede solpaneler i
 * korrekt størrelsesforhold. Geometri gemmes som JSONB (drawing_data); kun
 * felter til listevisning/optælling er denormaliseret på rækken.
 *
 * Koordinatsystem: alle x/y er i NATURLIGE billed-pixels (image_width ×
 * image_height), uafhængigt af visningsstørrelse. SVG'en bruger et viewBox
 * der matcher de naturlige mål.
 */

/**
 * Et placeret solpanel.
 *
 * x/y = øverste venstre hjørne i naturlige billed-px, i panelets EGET
 * (u-roterede) koordinatsystem. Den frie rotation (`angle`) tegnes som en
 * rotation om panelets centrum oven på dette.
 */
export interface PanelPlacement {
  id: string
  x: number
  y: number
  /** Orientering: 0 = stående (portrait), 90 = liggende (landscape). Bytter bredde/højde. */
  rotation: 0 | 90
  /**
   * Fri rotation i grader (med uret) om panelets centrum, så panelet kan følge
   * tagets skæve vinkel på billedet. 0 = akse-justeret. Ortogonal til `rotation`.
   * Valgfri/additiv: ældre tegninger uden feltet behandles som 0.
   */
  angle?: number
  /**
   * Id på det felt (RoofField) panelet hører til, hvis det blev lagt via
   * "Udfyld felt". Binder gitter-paneler sammen så hele gruppen kan drejes,
   * udvides eller få fjernet enkelt-celler samlet. Løse enkelt-paneler (og
   * ældre tegninger) mangler feltet og behandles som selvstændige.
   */
  fieldId?: string
  /**
   * Panelets gitter-koordinat i sit felt (række/kolonne, 0-indekseret i feltets
   * lokale frame). Stemples ved oprettelse, så "hvilke celler er optaget" er
   * eksakt og drift-frit — selv hvis panelet senere nudges enkeltvis. Additiv.
   */
  cell?: { r: number; c: number }
}

/**
 * Et felt = en gruppe paneler lagt i samme gitter via "Udfyld felt".
 *
 * Kun det der er et bevidst designvalg og IKKE kan rekonstrueres pålideligt
 * gemmes her; pitch/dimensioner/antal udledes on-demand af panelmål + gab +
 * målestok (præcis som udfyld selv gør), så feltet ikke kan "drifte" væk fra
 * panelerne. Additivt felt — ældre tegninger har det ikke.
 */
export interface RoofField {
  id: string
  /** Gruppens rotation i grader (med uret). Deles af alle panelers `angle`. */
  angle: number
  /** Celle-orientering: 0 = stående, 90 = liggende (svarer til panelets `rotation`). */
  orientation: 0 | 90
  /** Celle-(0,0)'s øverste venstre hjørne i naturlige billed-px (gitter-anker). */
  origin: { x: number; y: number }
  /** Cellenøgler "r,c" brugeren bevidst har fjernet (forhindringer i feltet). */
  removed: string[]
}

/** Referencelinje brugt til at sætte målestok. Punkter i naturlige billed-px. */
export interface ReferenceLine {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Reel længde af linjen i meter, indtastet af brugeren. */
  realLengthMeters: number
}

/** Standard-mellemrum mellem paneler (montageskinne-gab) i mm. */
export const DEFAULT_PANEL_GAP_MM = 20

/** Geometri-payload gemt i roof_drawings.drawing_data (JSONB). */
export interface RoofDrawingData {
  referenceLine: ReferenceLine | null
  /** Millimeter pr. billed-pixel, udledt af referenceLine. null = ikke sat. */
  mmPerPx: number | null
  /** Fysiske mål for det valgte panel (kopieret ved valg, så gammel geometri er stabil). */
  panelWidthMm: number
  panelHeightMm: number
  /** Mellemrum mellem paneler (mm) brugt ved snapping + udfyld-område. Additivt felt. */
  panelGapMm: number
  panels: PanelPlacement[]
  /**
   * Felt-metadata pr. fieldId (gitter-anker/vinkel/orientering/fjernede celler).
   * Additivt: ældre tegninger har det ikke → behandles som tomt. Paneler forbliver
   * den materialiserede kilde til rendering/optælling; dette gør blot "udvid i
   * samme gitter" og "genskab fjernet celle" robust.
   */
  fields?: Record<string, RoofField>
}

export function emptyRoofDrawingData(
  panelWidthMm: number,
  panelHeightMm: number,
): RoofDrawingData {
  return {
    referenceLine: null,
    mmPerPx: null,
    panelWidthMm,
    panelHeightMm,
    panelGapMm: DEFAULT_PANEL_GAP_MM,
    panels: [],
    fields: {},
  }
}

/** Rå række fra roof_drawings. */
export interface RoofDrawing {
  id: string
  customer_id: string
  service_case_id: string | null
  title: string
  image_storage_path: string
  image_width: number
  image_height: number
  panel_product_code: string | null
  panel_count: number
  drawing_data: RoofDrawingData
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Række beriget med en frisk signed URL til billedet (til visning). */
export interface RoofDrawingWithUrl extends RoofDrawing {
  image_url: string | null
}

// =====================================================
// Action input-typer
// =====================================================

export interface CreateRoofDrawingInput {
  customerId: string
  serviceCaseId?: string | null
  title?: string
  /** data:image/jpeg;base64,... (klientside-komprimeret) */
  imageBase64: string
  imageWidth: number
  imageHeight: number
  panelProductCode?: string | null
  panelWidthMm: number
  panelHeightMm: number
}

export interface ListRoofDrawingsInput {
  serviceCaseId?: string | null
  customerId?: string | null
}

export interface SaveRoofDrawingInput {
  id: string
  title?: string
  panelProductCode?: string | null
  panelCount: number
  drawingData: RoofDrawingData
}
