import { InsulinBrand } from '../models/insulin';

export const INSULIN_CATALOG: InsulinBrand[] = [
  // PRANDIAL · ULTRARRÁPIDAS · PLUMAS
  { id:'fiasp-pen', device:'pen', tradeName:'Fiasp', substance:'fast aspart',
    class:'prandial', speed:'ultrarrapida', notes:'FlexTouch' },
  { id:'novorapid-pen', device:'pen', tradeName:'NovoRapid', substance:'aspart',
    class:'prandial', speed:'ultrarrapida', notes:'FlexPen' },
  { id:'apidra-pen', device:'pen', tradeName:'Apidra', substance:'glulisina',
    class:'prandial', speed:'ultrarrapida' },
  { id:'humalog-pen-100', device:'pen', tradeName:'Humalog 100', substance:'lispro',
    class:'prandial', speed:'ultrarrapida', notes:'KwikPen' },
  { id:'humalog-pen-200', device:'pen', tradeName:'Humalog 200', substance:'lispro',
    class:'prandial', speed:'ultrarrapida', notes:'KwikPen 200' },

  // PRANDIAL · ULTRARRÁPIDAS · VIALES
  { id:'fiasp-vial', device:'vial', tradeName:'Fiasp', substance:'fast aspart',
    class:'prandial', speed:'ultrarrapida' },
  { id:'humalog-vial-100', device:'vial', tradeName:'Humalog 100', substance:'lispro',
    class:'prandial', speed:'ultrarrapida' },

  // PRANDIAL · RÁPIDAS
  { id:'actrapid-vial', device:'vial', tradeName:'Actrapid',
    class:'prandial', speed:'rapida' },
  { id:'humulina-regular-vial', device:'vial', tradeName:'Humulina Regular',
    class:'prandial', speed:'rapida' },
  { id:'actrapid-pen', device:'pen', tradeName:'Actrapid InnoLet',
    class:'prandial', speed:'rapida' },

  // BASAL · INTERMEDIAS (NPH)
  { id:'insulatard-vial', device:'vial', tradeName:'Insulatard (NPH)',
    class:'basal', speed:'intermedia' },
  { id:'insulatard-pen', device:'pen', tradeName:'Insulatard FlexPen',
    class:'basal', speed:'intermedia' },
  { id:'humulina-nph-vial', device:'vial', tradeName:'Humulina NPH',
    class:'basal', speed:'intermedia' },

  // BASAL · PROLONGADAS (GLARGINA 100 / 300, DETEMIR, DEGLUDEC)
  { id:'lantus-vial', device:'vial', tradeName:'Lantus (glargina 100)',
    class:'basal', speed:'prolongada' },
  { id:'abasaglar-pen', device:'pen', tradeName:'Abasaglar KwikPen (glargina 100)',
    class:'basal', speed:'prolongada' },
  { id:'toujeo-pen', device:'pen', tradeName:'Toujeo SoloStar (glargina 300)',
    class:'basal', speed:'prolongada' },
  { id:'levemir-pen', device:'pen', tradeName:'Levemir FlexPen (detemir)',
    class:'basal', speed:'prolongada' },
  { id:'tresiba-pen-100', device:'pen', tradeName:'Tresiba FlexTouch 100 (degludec)',
    class:'basal', speed:'prolongada' },
  { id:'tresiba-pen-200', device:'pen', tradeName:'Tresiba FlexTouch 200 (degludec)',
    class:'basal', speed:'prolongada' },

  // MEZCLAS (ejemplos)
  { id:'mixtard30-vial', device:'vial', tradeName:'Mixtard 30 (rápida + NPH)',
    class:'mix', speed:'mixta' },
  { id:'novomix30-pen', device:'pen', tradeName:'NovoMix 30 FlexPen (aspart + NPA)',
    class:'mix', speed:'mixta' },
  { id:'humalog-mix25-pen', device:'pen', tradeName:'Humalog Mix 25 KwikPen (lispro + NPL)',
    class:'mix', speed:'mixta' },
];
