/** Gateway profiles available to authored cloud requests and explicitly shared media. */
export const cloudProviders = ['brain', 'kimi', 'gemini', 'gemma31', 'gemma26', 'inkling'] as const

export type CloudProvider = typeof cloudProviders[number]
