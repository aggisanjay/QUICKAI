
import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import axios from "axios";
import {v2 as cloudinary} from 'cloudinary';
import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY, // ✅ Your Gemini API key
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" // ✅ Gemini-compatible OpenAI URL
});

export const generateArticle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, length } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if (!prompt || !length) {
            return res.status(400).json({ success: false, message: "Prompt and length are required." });
        }

        if (plan !== "premium" && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue." });
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash", // ✅ Make sure your key has access
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: length,
        });

        const content = response.choices[0].message.content;

        await sql`INSERT INTO creations (user_id, prompt, content, type) VALUES (${userId}, ${prompt}, ${content}, 'article')`;

        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: free_usage + 1
                }
            });
        }

        res.json({ success: true, content });

    } catch (error) {
        console.error("Gemini via OpenAI SDK Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const generateBlogTitle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt} = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if (!prompt ) {
            return res.status(400).json({ success: false, message: "Prompt and length are required." });
        }

        if (plan !== "premium" && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue." });
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash", // ✅ Make sure your key has access
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const content = response.choices[0].message.content;

        await sql`INSERT INTO creations (user_id, prompt, content, type) VALUES (${userId}, ${prompt}, ${content}, 'blog-title')`;

        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: free_usage + 1
                }
            });
        }

        res.json({ success: true, content });

    } catch (error) {
        console.error("Gemini via OpenAI SDK Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};



export const generateImage = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, publish } = req.body;
    const plan = req.plan;

    if (!prompt) {
      return res
        .status(400)
        .json({ success: false, message: 'Prompt is required.' });
    }

    if (plan !== 'premium') {
      return res.json({
        success: false,
        message: 'This feature is only available to premium users.',
      });
    }

    // Step 1: Build form data
    const formData = new FormData();
    formData.append('prompt', prompt);

    // Step 2: Call ClipDrop API with proper axios config
    const response = await axios.post(
      'https://clipdrop-api.co/text-to-image/v1',
      formData,
      {
        headers: {
          'x-api-key': process.env.CLIPDROP_API_KEY,
          
        },
        responseType: 'arraybuffer', // ✅ Correct place
      }
    );

    // Step 3: Convert binary response to base64
    const base64Image = `data:image/png;base64,${Buffer.from(
      response.data
    ).toString('base64')}`;

    // Optional: validate base64 string (length or magic header)
    if (!base64Image || base64Image.length < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image received from API',
      });
    }

    // Step 4: Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(base64Image, {
      folder: 'quickai',
    });

    // Step 5: Insert into DB
    await sql`
      INSERT INTO creations (user_id, prompt, content, type, publish)
      VALUES (${userId}, ${prompt}, ${uploadResult.secure_url}, 'image', ${publish ?? false})
    `;

    return res.json({ success: true, content: uploadResult.secure_url });
  } catch (error) {
    console.error('Error generating image:', error);
    return res
      .status(500)
      .json({ success: false, message: error.message || 'Server error' });
  }
};


export const removeImageBackground = async (req, res) => {
  try {
    const { userId } = req.auth();
    const  image  = req.file;
    const plan = req.plan;

    

    if (plan !== 'premium') {
      return res.json({
        success: false,
        message: 'This feature is only available to premium users.',
      });
    }
    

    // Step 4: Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(image.path, {
      folder: 'quickai',
    
      transformation:[
        {
          effect: 'background_removal',
          background_removal: 'remove_the_background',
        }
      ]
    });

    // Step 5: Insert into DB
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, 'Remove backgorund from image', ${uploadResult.secure_url}, 'image' )
    `;

    return res.json({ success: true, content: uploadResult.secure_url });
  } catch (error) {
    console.error('Error removing image background:', error);
    return res
      .status(500)
      .json({ success: false, message: error.message || 'Server error' });
  }
};


export const removeImageObject = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { object } = req.body;
    const image  = req.file;
    const plan = req.plan;

    

    if (plan !== 'premium') {
      return res.json({
        success: false,
        message: 'This feature is only available to premium users.',
      });
    }
    

    // Step 4: Upload to Cloudinary
    const {public_id} = await cloudinary.uploader.upload(image.path, {
      folder: 'quickai',
    });

   const imageUrl= cloudinary.url(public_id,{
      transformation:[{effect:`gen_remove:${object}`}],
      resource_type:'image'
    })

    // Step 5: Insert into DB
    await sql`
      INSERT INTO creations (user_id,prompt,content, type)
      VALUES (${userId}, ${`Removed ${object} from image`}, ${imageUrl}, 'image' )
    `;

    return res.json({ success: true, content: imageUrl });
  } catch (error) {
    console.error('Error removing image object:', error);
    return res
      .status(500)
      .json({ success: false, message: error.message || 'Server error' });
  }
};


export const resumeReview = async (req, res) => {
  try {
    const { userId } = req.auth();
    
    const  resume = req.file;
    const plan = req.plan;

    

    if (plan !== 'premium') {
      return res.json({
        success: false,
        message: 'This feature is only available to premium users.',
      });
    }
    
    if(resume.size> 5 * 1024 * 1024) { // 5MB limit
      return res.status(400).json({ success: false, message: 'File size exceeds 5MB limit.' });
    }

    const dataBuffer=fs.readFileSync(resume.path)

     const pdfData = await pdf(dataBuffer);

     const prompt=`Review the following resume and provide constructive feedback on its strengths, weakness, and areas for improvement. Resume Content:\n\n${pdfData.text} `
     
     const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash", // ✅ Make sure your key has access
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const content = response.choices[0].message.content;
    // Step 5: Insert into DB
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')
    `;

    return res.json({ success: true, content});
  } catch (error) {
    console.error('Error reviewing resume:', error);
    return res
      .status(500)
      .json({ success: false, message: error.message || 'Server error' });
  }
};


