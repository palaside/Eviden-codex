import type {GeminiReviewReport} from '@/types/slip-ocr-trace';

export default function GeminiReviewDetails({report,sourceIndex}:{report:GeminiReviewReport;sourceIndex?:number}){
  const slips=report.slipAssessments.filter(slip=>sourceIndex===undefined||slip.sourceIndex===sourceIndex);
  return <details className="mt-1 text-[10px] text-amber-200" data-testid="gemini-field-review">
    <summary className="cursor-pointer">ผลอ่าน Gemini ราย field · review_required · {report.issues.length} จุดรอตรวจ</summary>
    <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
      {slips.map(slip=><div key={slip.sourceIndex} className="mt-2 border-t border-white/10 pt-1">
        <div>สลิปตำแหน่ง {slip.sourceIndex+1} · ทุกค่ายังต้องตรวจโดยผู้ใช้</div>
        {Object.entries(slip.fieldAssessments).map(([field,result])=><div key={field}>
          {field}: {result.value===null?'ไม่มีข้อมูล':typeof result.value==='string'?result.value:JSON.stringify(result.value)}
          {' · '}{result.status==='supported'?'มีหลักฐานข้อความและพิกัดรองรับ':result.status==='conflict'?'ค่าขัดแย้ง':result.status==='unavailable'?'ยังอ่านไม่ได้':'ข้อเสนอที่ยังไม่ผ่านหลักฐาน ห้ามรวมยอด'}
          {' · '}{result.reason}
        </div>)}
      </div>)}
      {report.issues.map((issue,index)=><div key={index}>{issue.path}: {issue.reason}</div>)}
    </div>
  </details>;
}
