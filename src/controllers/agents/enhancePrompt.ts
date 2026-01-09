import { Request, Response } from 'express';
import OpenAI from 'openai';
import { randomInt } from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const enhancePrompt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt, generationType } = req.body;

    // Validate required fields
    if (!prompt || !generationType) {
      res.status(400).json({ error: 'Prompt and generationType are required' });
      return;
    }

    if (!['image', 'video'].includes(generationType)) {
      res.status(400).json({ error: "Type must be 'image' or 'video'" });
      return;
    }

    // Set up streaming response with production-ready headers
    // Note: For production, ensure reverse proxy (nginx/cloudflare) doesn't buffer
    // Add to nginx config: proxy_buffering off; proxy_cache off;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Disable buffering for various platforms and reverse proxies
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx
    res.setHeader('X-Nginx-Buffering', 'no'); // Nginx alternative
    res.setHeader('X-Apache-Buffering', 'no'); // Apache
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent compression middleware from buffering
    res.setHeader('Content-Encoding', 'identity');

    // Send headers immediately
    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // Write initial empty chunk to force headers to be sent immediately
    // This is critical for production environments with reverse proxies
    res.write('');

    if (res.finished) {
      return;
    }

    // Handle random prompt generation
    let finalPrompt = prompt;
    if (prompt.toLowerCase() === 'random') {
      const randomPrompts = {
        image: [
          'A futuristic cityscape at sunset with flying cars and neon lights',
          'A mystical forest with glowing mushrooms and fairy lights',
          'A steampunk laboratory with brass gears and steam pipes',
          'A serene mountain lake reflecting snow-capped peaks',
          'A cyberpunk street scene with holographic advertisements',
          'A majestic dragon soaring over a medieval castle at twilight',
          'A cozy cabin in the woods with warm light glowing from windows',
          'A space station orbiting a distant planet with Earth visible in the background',
          'A vintage 1950s diner with chrome details and neon signs',
          'A underwater city with bioluminescent coral and sea creatures',
          'A post-apocalyptic wasteland with abandoned buildings and dust storms',
          'A magical library with floating books and starlit ceiling',
          'A Japanese garden with cherry blossoms and koi pond',
          'A desert oasis with palm trees and crystal clear water',
          'A gothic cathedral with intricate stained glass windows',
          'A tropical beach with turquoise water and white sand',
          'A mountain peak piercing through clouds at sunrise',
          'A bustling marketplace in an ancient city with colorful stalls',
          'A modern art gallery with abstract sculptures and dramatic lighting',
          'A peaceful countryside with rolling hills and wildflowers',
          'A space battle with starships and laser beams',
          'A cozy coffee shop with steam rising from cups',
          'A frozen tundra with aurora borealis dancing in the sky',
          'A steampunk airship floating above Victorian London',
          'A magical potion shop with glowing bottles and mysterious ingredients',
        ],
        video: [
          'A time-lapse of a blooming flower garden in spring',
          'A cinematic drone shot over a misty mountain range',
          'A bustling city street with people and traffic in motion',
          'Ocean waves crashing against rocky cliffs at sunset',
          'A magical forest with falling leaves and dancing shadows',
          'A slow-motion shot of raindrops hitting a window',
          'A cooking montage showing ingredients being prepared',
          'A dance performance with flowing fabric and graceful movements',
          'A train journey through changing landscapes',
          'A firework display lighting up the night sky',
          'A butterfly emerging from its cocoon in extreme close-up',
          'A street performer juggling flaming torches',
          'A storm rolling in over a peaceful lake',
          'A busy kitchen with chefs working in perfect harmony',
          'A car chase through narrow city streets',
          'A peaceful meditation scene with flowing water',
          'A sports highlight reel with dramatic slow-motion',
          'A wedding ceremony with confetti falling',
          'A construction site with cranes and workers',
          'A music concert with crowd energy and stage lights',
          'A wildlife documentary showing animals in their habitat',
          'A fashion runway with models walking in elegant outfits',
          'A time-lapse of stars moving across the night sky',
          'A underwater scene with fish swimming in schools',
          'A city skyline transforming from day to night',
        ],
      };

      const randomArray = randomPrompts[generationType as keyof typeof randomPrompts];
      if (randomArray && randomArray.length > 0) {
        const randomIndex = randomInt(0, randomArray.length);
        finalPrompt = randomArray[randomIndex];
      }
    }

    // Create system prompt based on type
    const systemPrompt =
      generationType === 'image'
        ? `You are an expert prompt engineer for AI image generation. Your task is to enhance basic prompts into detailed, vivid descriptions that will produce high-quality images. 

Guidelines:
- Add specific visual details, lighting, composition, and artistic style
- Include camera angles, perspective, and mood
- Specify colors, textures, and atmospheric effects
- Make it cinematic and visually compelling
- Keep it under 200 words
- Focus on visual elements that AI image models can render well

Examples:
- "food" → "A mouth-watering close-up of a perfectly grilled steak with charred grill marks, glistening with juices, on a rustic wooden cutting board with fresh herbs and garlic, dramatic side lighting creating deep shadows, shallow depth of field, food photography style"
- "ocean scene" → "A breathtaking panoramic view of crystal-clear turquoise ocean waves crashing against pristine white sand beach, golden hour lighting with warm orange and pink sky, seagulls flying overhead, tropical palm trees swaying in the breeze, cinematic wide-angle shot"

Enhance this prompt: "${finalPrompt}"`
        : `You are an expert prompt engineer for AI video generation. Your task is to enhance basic prompts into detailed, cinematic descriptions that will produce high-quality videos.

Guidelines:
- Add specific camera movements, transitions, and visual effects
- Include timing, pacing, and dynamic elements
- Specify lighting, atmosphere, and mood
- Make it cinematic and engaging
- Keep it under 200 words
- Focus on motion and visual storytelling

Examples:
- "food" → "A slow-motion close-up video of a chef's hands delicately plating a gourmet dish, with steam rising from hot food, dramatic overhead lighting, smooth camera movement following the plating process, shallow depth of field, professional food videography style"
- "ocean scene" → "A cinematic drone video starting with a wide aerial shot of endless ocean waves, slowly descending to capture the rhythmic motion of waves crashing against rocky cliffs, golden hour lighting with warm colors, smooth camera movements, epic and majestic atmosphere"

Enhance this prompt: "${finalPrompt}"`;

    // Stream the response
    const stream = await openai.responses.create({
      model: 'gpt-5.2',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalPrompt },
      ],
      stream: true,
    });

    // Helper function to write data with backpressure handling
    const writeToResponse = (data: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!res.writable || res.destroyed) {
          reject(new Error('Response is not writable'));
          return;
        }

        try {
          const written = res.write(data);

          // Always try to flush immediately for streaming
          if (typeof (res as any).flush === 'function') {
            try {
              (res as any).flush();
            } catch (flushError) {
              // Ignore flush errors, continue with write
            }
          }

          if (written) {
            resolve();
          } else {
            res.once('drain', () => {
              // Flush again after drain
              if (typeof (res as any).flush === 'function') {
                try {
                  (res as any).flush();
                } catch (flushError) {
                  // Ignore flush errors
                }
              }
              resolve();
            });
            res.once('error', reject);
          }
        } catch (writeError) {
          reject(writeError);
        }
      });
    };

    try {
      for await (const chunk of stream) {
        const chunkAny = chunk as any;
        let textToWrite = '';

        // Handle response.output_item.delta events (streaming text deltas)
        if (chunkAny.type === 'response.output_item.delta' && chunkAny.delta) {
          if (chunkAny.delta.text && typeof chunkAny.delta.text === 'string') {
            textToWrite = chunkAny.delta.text;
          } else if (chunkAny.delta.content && typeof chunkAny.delta.content === 'string') {
            textToWrite = chunkAny.delta.content;
          } else if (typeof chunkAny.delta === 'string') {
            textToWrite = chunkAny.delta;
          }
        }
        // Handle response.output_item.added events (complete items)
        else if (chunkAny.type === 'response.output_item.added' && chunkAny.item) {
          if (chunkAny.item.content && typeof chunkAny.item.content === 'string') {
            textToWrite = chunkAny.item.content;
          } else if (chunkAny.item.text && typeof chunkAny.item.text === 'string') {
            textToWrite = chunkAny.item.text;
          } else if (typeof chunkAny.item === 'string') {
            textToWrite = chunkAny.item;
          }
        }
        // Handle response.output_text.delta events - delta IS the text (string)
        else if (chunkAny.type === 'response.output_text.delta' && chunkAny.delta) {
          if (typeof chunkAny.delta === 'string') {
            textToWrite = chunkAny.delta;
          } else if (chunkAny.delta.text && typeof chunkAny.delta.text === 'string') {
            textToWrite = chunkAny.delta.text;
          }
        }
        // Fallback: check if delta exists directly as string
        else if (chunkAny.delta && typeof chunkAny.delta === 'string') {
          textToWrite = chunkAny.delta;
        }
        // Fallback: check if delta exists as object with text property
        else if (chunkAny.delta?.text && typeof chunkAny.delta.text === 'string') {
          textToWrite = chunkAny.delta.text;
        }
        // Fallback: check for direct text property
        else if (chunkAny.text && typeof chunkAny.text === 'string') {
          textToWrite = chunkAny.text;
        }

        // Write and flush the text if we have any
        if (textToWrite && typeof textToWrite === 'string' && textToWrite.length > 0) {
          try {
            await writeToResponse(textToWrite);
          } catch (writeError) {
            console.error('Error writing to response:', writeError);
            throw writeError;
          }
        }
      }
    } catch (streamError) {
      console.error('Error processing stream:', streamError);
      throw streamError;
    } finally {
      res.end();
    }
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to enhance prompt' });
    } else {
      res.end();
    }
  }
};
