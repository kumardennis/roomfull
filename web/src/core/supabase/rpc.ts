import type { Database } from './database.types'
import { supabase } from './client'

type PublicSchema = Database['public']
type RpcName = keyof PublicSchema['Functions']

export async function callRpc<TReturn, TRpc extends RpcName = RpcName>(
  functionName: TRpc,
  args: PublicSchema['Functions'][TRpc]['Args'] = {} as PublicSchema['Functions'][TRpc]['Args'],
): Promise<TReturn> {
  const { data, error } = await supabase.rpc(functionName, args)
  if (error) throw error
  return data as TReturn
}

/** For RPCs added locally before types are regenerated. */
export async function callRpcUntyped<TReturn>(
  functionName: string,
  args: Record<string, unknown> = {},
): Promise<TReturn> {
  const { data, error } = await supabase.rpc(functionName as RpcName, args)
  if (error) throw error
  return data as TReturn
}
