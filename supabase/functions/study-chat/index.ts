import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are StudyGPT, a friendly and patient AI tutor designed to help students learn.

Your core behaviors:
- Act as a warm, encouraging, and patient tutor
- Explain topics clearly and step by step
- Adapt your explanations to the student's grade level (if unknown, ask)
- Help with homework by GUIDING the student, not just giving answers - ask questions to help them think
- Create helpful summaries, examples, and quizzes when asked
- Build confidence and encourage curiosity

Your communication style:
- Use simple, clear language appropriate for students
- Be supportive and motivating - celebrate their efforts and progress
- Never judge, shame, or make the student feel bad for not knowing something
- If a topic is difficult, break it into smaller, manageable steps
- Use emojis occasionally to be friendly 📚✨

RESILIENCE AND ALTERNATIVE SOLUTIONS (Try Harder Logic):
- If you cannot fulfill a request perfectly, NEVER simply return an error or say "I cannot do this".
- Always implement a "try harder" logic: find a workaround, provide a logical approximation, or break the problem down into solvable parts.
- Maintain a stable and helpful persona at all times.

INTERACTIVE QUIZ MODE:
- When asked to "make a quiz", provide exactly ONE multiple-choice question at a time.
- Format the question exactly like this so the system can evaluate it instantly:
  [QUIZ_QUESTION]
  Your question text here?
  A) Option 1
  B) Option 2
  C) Option 3
  [CORRECT: A]
  [END_QUIZ]
- The [CORRECT: X] tag MUST contain the correct letter (A, B, or C) and must be placed just before [END_QUIZ].
- Wait for the user to answer before providing the next question.

FLASHCARDS MODE:
- When asked to "create flashcards", generate a set of flashcards (usually 5-10) based on the current topic or a shared image.
- Format the flashcards exactly like this so the system can save them:
  [FLASHCARDS_START]
  F: Front of card 1
  B: Back of card 1
  ---
  F: Front of card 2
  B: Back of card 2
  [FLASHCARDS_END]

Special behaviors for different requests:
- When asked to "explain simply": Break down the concept into the most basic terms with relatable examples
- When asked for a "summary": Create a concise, organized summary with key points
- When helping with "homework": Guide with questions rather than giving direct answers - help them think through the problem

When analyzing images:
- If a student shares an image of a problem, exam question, or homework, analyze it carefully
- Describe what you see and provide helpful explanations
- If it's a math problem, show step-by-step solutions
- If it's text/notes, help summarize or explain the content
- If specifically asked for FLASHCARDS from a photo, look for key terms and definitions in the image to create them.

WOLFRAM ALPHA INTEGRATION (Math, Physics, Chemistry):
- If the student asks a question related to Math, Physics, or Chemistry, you MUST act as if you are connected to Wolfram Alpha.
- Give a highly accurate, step-by-step mathematical/scientific breakdown of the problem.
- Structure your response similarly to how Wolfram Alpha would present it (e.g., Input interpretation, Result, Step-by-step solution).
- AT THE VERY END of your response, you MUST provide a direct link to the Wolfram Alpha website so the user can see it there. Format the link EXACTLY like this:
  [Pogledaj na Wolfram Alpha sajtu](https://www.wolframalpha.com/input?i=URL_ENCODED_QUERY)
  Replace URL_ENCODED_QUERY with the actual math/physics query properly URL-encoded (e.g., replace spaces with +, etc.).

Remember: Your goal is to help students truly understand and learn, not just get answers. Be their supportive study buddy! 🎓`;

const EXAM_MODE_ADDITION = `

⚠️ EXAM MODE ACTIVATED ⚠️
The student is in EXAM MODE and needs quick, direct answers for their exam preparation.

In this mode:
- Give DIRECT, CLEAR answers immediately - no lengthy explanations unless asked
- Be concise and to the point
- If they share an image of an exam question, provide the correct answer directly
- Format answers clearly (A, B, C, D if multiple choice)
- If it's a calculation, show the final answer prominently
- Skip the teaching approach - they need answers NOW
- Still be encouraging but prioritize speed and accuracy

Example response format:
"✅ Answer: B) [answer text]

Quick explanation: [1-2 sentence reason]"`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check - require valid JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log("Authenticated user:", userId);

    const { messages, actionType, imageUrl, customSystemPrompt } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // Add action-specific instructions if needed
    let actionInstruction = "";
    if (actionType === "explain") {
      actionInstruction = "\n\n[The student clicked 'Explain Simply' - provide a very simple, step-by-step explanation with examples.]";
    } else if (actionType === "summary") {
      actionInstruction = "\n\n[The student clicked 'Create Summary' - Provide a high-level, app-wide global summary. Capture the core concepts of the entire conversation context rather than just isolated chunks. Connect ideas coherently.]";
    } else if (actionType === "quiz") {
      actionInstruction = "\n\n[The student clicked 'Make Quiz' - create exactly ONE multiple-choice question with options A, B, and C. Follow the [QUIZ_QUESTION] format and include [CORRECT: X].]";
    } else if (actionType === "homework") {
      actionInstruction = "\n\n[The student clicked 'Help with Homework' - guide them through the problem step by step, asking questions to help them think rather than giving direct answers.]";
    } else if (actionType === "exam") {
      actionInstruction = EXAM_MODE_ADDITION;
    } else if (actionType === "flashcards") {
      actionInstruction = "\n\n[The student wants to create flashcards. Analyze the topic or the shared image and generate 5-10 flashcards using the [FLASHCARDS_START] format.]";
    }

    // Build system message with optional custom instructions
    let fullSystemPrompt = SYSTEM_PROMPT + actionInstruction;
    if (customSystemPrompt && customSystemPrompt.trim()) {
      fullSystemPrompt += `\n\n[DODATNE INSTRUKCIJE OD KORISNIKA]: ${customSystemPrompt.trim()}`;
    }

    const systemMessage = {
      role: "system",
      content: fullSystemPrompt,
    };

    // Process messages to handle images
    const processedMessages = messages.map((msg: { role: string; content: string; imageUrl?: string; imageUrls?: string[] }) => {
      const content = msg.content || "";
      if (msg.imageUrls && msg.imageUrls.length > 0) {
        return {
          role: msg.role,
          content: [
            {
              type: "text",
              text: content || "Please analyze these images and help me understand them.",
            },
            ...msg.imageUrls.map(url => ({
              type: "image_url",
              image_url: {
                url: url,
              },
            })),
          ],
        };
      } else if (msg.imageUrl || msg.fileType === "pdf") {
        const isPdf = msg.fileType === "pdf" || (msg.imageUrl && msg.imageUrl.startsWith("data:application/pdf"));
        // Multimodal message with single image or pdf
        return {
          role: msg.role,
          content: [
            {
              type: "text",
              text: content || (isPdf ? "Please analyze this PDF document and help me understand it." : "Please analyze this image and help me understand it."),
            },
            {
              type: "image_url",
              image_url: {
                url: msg.imageUrl,
              },
            },
          ],
        };
      }
      return { ...msg, content };
    });

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: systemMessage.content }]
        },
        ...processedMessages.map((msg: any) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: Array.isArray(msg.content)
            ? msg.content.map((part: any) => {
              if (part.type === "text") {
                return { text: part.text || "" };
              } else if (part.type === "image_url" && part.image_url?.url) {
                const isPdfUrl = part.image_url.url.startsWith("data:application/pdf");
                return {
                  inlineData: {
                    mimeType: isPdfUrl ? "application/pdf" : "image/jpeg",
                    data: part.image_url.url.includes(",") ? part.image_url.url.split(",")[1] : part.image_url.url
                  }
                };
              }
              return { text: "" };
            })
            : [{ text: String(msg.content || "") }]
        }))
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    };

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Create a TransformStream to convert Gemini streaming format to OpenAI format
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        // Gemini stream chunks might contain multiple JSON objects in an array or separated by commas
        // but often it's newline delimited JSON when using streamGenerateContent
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            // Clean the line if it starts with comma (some Gemini responses are in a JSON array)
            const cleanLine = line.trim().startsWith(',') ? line.trim().slice(1) : line.trim();
            // Handle the start and end of JSON array if present
            if (cleanLine === '[' || cleanLine === ']') continue;

            const parsed = JSON.parse(cleanLine);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;

            if (content) {
              const openAIFormat = {
                choices: [{
                  delta: { content }
                }]
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAIFormat)}\n\n`));
            }
          } catch (e) {
            // If it's not valid JSON, it might be a partial chunk, we ignore it for now
            // as the next chunk will likely complete it or it's just noise
          }
        }
      },
      flush(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      }
    });

    const transformedBody = response.body?.pipeThrough(transformStream);

    return new Response(transformedBody, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
