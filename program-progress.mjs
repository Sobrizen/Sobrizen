/** Versioned writes for private reflection steps. No silent legacy upsert fallback. */
export class ProgramProgressConflictError extends Error {
  constructor(){
    super('Cette étape a changé dans une autre fenêtre. Ta réflexion est conservée : recharge la version enregistrée avant de réessayer.');
    this.name='ProgramProgressConflictError';
    this.code='PROGRAM_PROGRESS_CONFLICT';
  }
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export async function saveProgramProgress(db,{userId,step,reflection='',expectedRevision=0}={}){
  if(!uuid.test(userId||''))throw Error('Connecte-toi pour enregistrer cette étape.');
  if(!Number.isInteger(step)||step<1||step>30)throw Error('Étape invalide.');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Recharge cette étape avant de l’enregistrer.');
  if(typeof reflection!=='string'||[...reflection].length>2000)throw Error('Ta réflexion est limitée à 2 000 caractères.');
  const {data,error}=await db.rpc('save_program_progress',{
    p_expected_user_id:userId,p_step:step,p_reflection:reflection.trim()||null,
    p_expected_revision:expectedRevision,
  });
  if(error){
    if(error.code==='40001')throw new ProgramProgressConflictError();
    if(error.code==='PGRST202'||error.code==='42883')throw Error('La sauvegarde des étapes est temporairement indisponible. Ta réflexion est conservée. Réessaie plus tard.');
    throw error;
  }
  if(!data||Array.isArray(data)||data.user_id!==userId||data.step!==step||!Number.isSafeInteger(data.revision)||data.revision<=expectedRevision||!data.updated_at||!data.completed_at){
    throw Error('La confirmation de sauvegarde est invalide. Ta réflexion est conservée : recharge cette étape pour vérifier son état.');
  }
  return data;
}
