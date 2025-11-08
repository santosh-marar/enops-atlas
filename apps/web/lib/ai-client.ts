import { MAX_TOKENS, TEMPERATURE } from "@/constant/ai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const SYSTEM_PROMPTS: Record<string, string> = {
  prisma: `You are an expert in Prisma ORM. Generate clean, production-ready Prisma schema code with:
- Proper model definitions with correct field types (Int, String, Boolean, DateTime, Json, etc.)
- Relations using @relation with proper fields and references
- Use @@id for composite primary keys, @id for single field primary keys
- Use @default() for default values (autoincrement(), now(), uuid(), etc.)
- Use @unique for unique constraints, @@unique for composite unique constraints
- Use @@index for indexes with proper field lists
- Add onDelete and onUpdate cascade rules where appropriate
- Include createdAt and updatedAt fields with @default(now()) and @updatedAt
- Use proper Prisma types: @db.VarChar(255), @db.Text, @db.Timestamp, etc.
- Always include the datasource and generator blocks at the top`,

  drizzle: `You are an expert in Drizzle ORM. Generate clean, production-ready Drizzle schema code with:
- Proper table definitions using pgTable (from 'drizzle-orm/pg-core'), mysqlTable, or sqliteTable
- Use correct column types: serial(), integer(), text(), varchar(), boolean(), timestamp(), jsonb(), etc.
- Use .notNull(), .unique(), .default() as method chains on columns
- Define relations separately using relations() function
- Use references() for foreign keys: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
- Add indexes using .index() or create separate index definitions
- Include proper TypeScript types with InferSelectModel and InferInsertModel
- Example correct syntax:
  export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: text('name'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  });`,

  mongoose: `You are an expert in Mongoose ODM. Generate clean, production-ready Mongoose schema code with:
- Proper Schema definitions using new mongoose.Schema()
- Appropriate field types (String, Number, Boolean, Date, ObjectId, Array, Mixed, etc.)
- Use { type: mongoose.Schema.Types.ObjectId, ref: 'ModelName' } for references
- Add validation rules (required, unique, min, max, enum, match, validate, etc.)
- Use timestamps: true option for automatic createdAt and updatedAt
- Add indexes using index: true or create compound indexes
- Include proper TypeScript interfaces for type safety
- Export models with mongoose.model<Interface>('ModelName', schema)
- Use proper default values and virtuals where needed`,

  typeorm: `You are an expert in TypeORM. Generate clean, production-ready TypeORM entity code with:
- Use @Entity() decorator for classes
- Use @PrimaryGeneratedColumn() for auto-increment IDs or @PrimaryColumn() for custom IDs
- Use @Column() with proper types: 'varchar', 'int', 'boolean', 'timestamp', 'text', 'json', etc.
- Use @CreateDateColumn() and @UpdateDateColumn() for timestamps
- Use @OneToMany(), @ManyToOne(), @OneToOne(), @ManyToMany() for relations with proper decorators
- Use @JoinColumn() for foreign keys and @JoinTable() for many-to-many
- Use @Index() for indexes and @Unique() for unique constraints
- Add { nullable: false, unique: true, default: value } options in @Column()
- Include cascade, onDelete, onUpdate options in relations
- Export classes with proper TypeScript types`,

  sequelize: `You are an expert in Sequelize ORM. Generate clean, production-ready Sequelize model code with:
- Use sequelize.define() or Model.init() for model definitions
- Use proper DataTypes: DataTypes.INTEGER, DataTypes.STRING, DataTypes.TEXT, DataTypes.BOOLEAN, DataTypes.DATE, DataTypes.JSON, etc.
- Add field options: allowNull, unique, primaryKey, autoIncrement, defaultValue
- Use timestamps: true for automatic createdAt and updatedAt
- Define associations using belongsTo, hasMany, hasOne, belongsToMany
- Add foreignKey and onDelete/onUpdate options in associations
- Include indexes using indexes array in model options
- Add validation rules in validate property
- Use proper TypeScript interfaces with Model extension
- Export models with proper types`,
};

const DBML_SYSTEM_PROMPT = `You are an expert database architect. Generate DBML (Database Markup Language) schema based on the user's requirements.

IMPORTANT RULES:
1. Return ONLY valid DBML syntax - no explanations, no markdown, no code blocks
2. Include all necessary tables and relationships
3. Use proper data types (int, varchar, text, timestamp, boolean, etc.)
4. Add indexes for foreign keys and frequently queried fields
5. Include createdAt and updatedAt timestamps where appropriate
6. Add proper constraints (not null, unique, pk, etc.)
7. Define relationships using Ref syntax
8. Consider the tech stack when designing the schema

Example DBML format:
Table users {
  id int [pk, increment]
  email varchar(255) [unique, not null]
  name varchar(255)
  createdAt timestamp [default: \`now()\`]

  Indexes {
    email
  }
}

Table posts {
  id int [pk, increment]
  userId int [not null]
  title varchar(255) [not null]
  content text
  createdAt timestamp [default: \`now()\`]
}

Ref: posts.userId > users.id [delete: cascade]`;

export interface AIGenerateOptions {
  provider: "claude" | "gpt";
  apiKey: string;
  prompt: string;
  orm?: string;
  database?: string;
  techStack?: {
    database: string;
    orm: string;
    language: string;
    backendFramework: string;
    authLibrary: string;
    billingLibrary: string;
  };
  onStream?: (chunk: string) => void;
}

export async function generateCode({
  provider,
  apiKey,
  prompt,
  orm,
  database,
  onStream,
}: AIGenerateOptions): Promise<string> {
  if (!orm || !database) {
    throw new Error("ORM and database are required");
  }

  const systemPrompt = SYSTEM_PROMPTS[orm];
  const userPrompt = `${prompt}

Target Database: ${database}

CRITICAL REQUIREMENTS:
1. Generate ONLY valid, syntactically correct ${orm.toUpperCase()} code
2. Follow the EXACT syntax and patterns for ${orm} - do not invent or mix syntax from other ORMs
3. Include ALL necessary imports at the top
4. Use proper column types, constraints, and relations syntax for ${orm}
5. Add proper TypeScript types where applicable
6. Include createdAt and updatedAt timestamps
7. Add proper indexes for foreign keys and frequently queried fields
8. NO explanations, NO markdown formatting, NO code blocks - just pure code
9. Make it production-ready and directly usable

Output should be valid ${orm} schema code that can be copied and used immediately.`;

  if (provider === "claude") {
    const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    if (onStream) {
      let fullText = "";
      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          const text = chunk.delta.text;
          fullText += text;
          onStream(text);
        }
      }

      let code = fullText;
      code = code.replace(/```[\w]*\n/g, "").replace(/```$/g, "").trim();
      return code;
    } else {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const content = message.content[0];
      if (content.type === "text") {
        let code = content.text;
        code = code.replace(/```[\w]*\n/g, "").replace(/```$/g, "").trim();
        return code;
      }
      throw new Error("No text content received");
    }
  } else if (provider === "gpt") {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    if (onStream) {
      let fullText = "";
      const stream = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullText += text;
          onStream(text);
        }
      }

      let code = fullText;
      code = code.replace(/```[\w]*\n/g, "").replace(/```$/g, "").trim();
      return code;
    } else {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      });

      let code = completion.choices[0]?.message?.content || "";
      code = code.replace(/```[\w]*\n/g, "").replace(/```$/g, "").trim();
      return code;
    }
  }

  throw new Error("Invalid provider");
}

export async function generateDBMLSchema({
  provider,
  apiKey,
  prompt,
  techStack,
  onStream,
}: AIGenerateOptions): Promise<string> {
  const techStackContext = techStack
    ? `
Tech Stack Context:
- Database: ${techStack.database}
- ORM/ODM: ${techStack.orm}
- Language: ${techStack.language}
- Backend: ${techStack.backendFramework}
- Auth: ${techStack.authLibrary}
- Billing: ${techStack.billingLibrary}
`
    : "";

  const fullPrompt = `${DBML_SYSTEM_PROMPT}\n${techStackContext}\n\nUser Request:\n${prompt}`;

  if (provider === "claude") {
    const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    if (onStream) {
      let fullText = "";
      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: DBML_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${techStackContext}\n\n${prompt}` }],
      });

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          const text = chunk.delta.text;
          fullText += text;
          onStream(text);
        }
      }

      return fullText;
    } else {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: DBML_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${techStackContext}\n\n${prompt}` }],
      });

      const content = message.content[0];
      if (content.type === "text") {
        return content.text;
      }
      throw new Error("No text content received");
    }
  } else if (provider === "gpt") {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    if (onStream) {
      let fullText = "";
      const stream = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: fullPrompt },
          { role: "user", content: prompt },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullText += text;
          onStream(text);
        }
      }

      return fullText;
    } else {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: fullPrompt },
          { role: "user", content: prompt },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      });

      return completion.choices[0]?.message?.content || "";
    }
  }

  throw new Error("Invalid provider");
}
