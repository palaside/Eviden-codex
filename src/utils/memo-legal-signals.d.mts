export function evaluateLegalSignals(text:string):Array<Record<string,unknown>>;
export function buildMemoLegalSignalHits(records:Array<{id:string;sourceItemId:string;source:string;sha256:string;dossierPage:number|null;chatPage?:string;data:{transaction:{note:string|null}}}>):Array<{
  id:string;sourceItemId:string;sourceFileName:string;page:number;text:string;confidence:number;bounds:null;
  provisionId:string;lawId:string;phrase:string;sourceKind:string;sourceSha256:string|null;sourceUrl:string|null;
  sourceStatus:string|null;sourceVersion:string|null;locator:string|null;reviewStatus:'human_review_required';legalDecision:false;
  missingEvidence:string[];counterIndicators:string[];
}>;
