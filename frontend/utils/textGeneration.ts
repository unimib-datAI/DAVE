import { Message } from '@/hooks/use-chat';

export function getPromptAndMessage(
  system: boolean,
  messages: Message[],
  devMode: boolean,
  devPrompt?: string
) {
  const defaultSystemPromptSearch =
    process.env.NEXT_PUBLIC_SYSTEM_PROMPT ||
    "Sei un assistente che parla esclusivamente italiano. La DOMANDA dell'utente si riferisce ai documenti che ti vengono forniti nel CONTESTO. Rispondi utilizzando solo le informazioni presenti nel CONTESTO. La risposta deve rielaborare le informazioni presenti nel CONTESTO. Argomenta in modo opportuno ed estensivo la risposta alla DOMANDA, devi generare risposte lunghe, non risposte da un paio di righe. Se non conosci la risposta, limitati a dire che non lo sai. Non dare mai risposte vuote. Non rispondere con 'Risposta: ' o cose simili, deve essere un messaggio di chat vero e proprio.";
  const defaultSystemPrompt =
    process.env.NEXT_PUBLIC_SYSTEM_PROMPT ||
    "Rispondi alle domande dell'utente.";
  let systemContent = '';

  console.log(
    '📝 getPromptAndMessage INPUT - messages:',
    messages.map((m) => ({
      role: m.role,
      content: m.content.slice(0, 100) + '...',
      usrMessage: m.usrMessage,
    }))
  );

  if (system) {
    systemContent = defaultSystemPrompt;
  } else if (devMode) {
    systemContent = devPrompt ? devPrompt : defaultSystemPromptSearch;
    if (!devPrompt) {
      console.log('setting search system prompt');
    }
  } else {
    console.log('setting search system prompt');
    systemContent = defaultSystemPromptSearch;
  }
  const messagesWithSystem = [
    { role: 'system', content: systemContent },
    ...messages,
  ];

  console.log(
    '📝 getPromptAndMessage OUTPUT - messages:',
    messagesWithSystem.map((m) => ({
      role: m.role,
      content: m.content.slice(0, 100) + '...',
      usrMessage: 'usrMessage' in m ? m.usrMessage : undefined,
    }))
  );

  return messagesWithSystem;
}
