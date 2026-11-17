export const visibilityLabels={private:'仅自己可见',selected:'指定同行者可见',trip:'全体同行者可见'};
export const ownsRecord=(record,userId)=>!record.ownerId||record.ownerId===(userId||'legacy-owner');
export const recordVisibilityLabel=record=>visibilityLabels[record.visibility||'private']||visibilityLabels.private;
