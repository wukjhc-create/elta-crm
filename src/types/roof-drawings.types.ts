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

/** Et placeret solpanel. x/y = øverste venstre hjørne i naturlige billed-px. */
export interface PanelPlacement {
  id: string
  x: number
  y: number
  /** 0 = stående (portrait), 90 = liggende (landscape). */
  rotation: 0 | 90
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

/** Geometri-payload gemt i roof_drawings.drawing_data (JSONB). */
export interface RoofDrawingData {
  referenceLine: ReferenceLine | null
  /** Millimeter pr. billed-pixel, udledt af referenceLine. null = ikke sat. */
  mmPerPx: number | null
  /** Fysiske mål for det valgte panel (kopieret ved valg, så gammel geometri er stabil). */
  panelWidthMm: number
  panelHeightMm: number
  panels: PanelPlacement[]
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
    panels: [],
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
