import type { TechStackType } from "@/components/custom/ai-tech-stack-dialog";
import { BASE_SYSTEM_PROMPT_SCHEMA_GEN } from "./schema-gen";

// This is for schema generation with context & based past schema work

function EnhancedSchemaGenPrompt(params: {
  techStack?: TechStackType;
  conversationHistory?: Array<{ role: string; content: string }>;
  recentSchemas?: Array<{
    name: string;
    description?: string;
    tableCount?: number;
    createdAt?: Date;
  }>;
}): string {
  const { techStack, conversationHistory = [], recentSchemas = [] } = params;

  let enhanced = BASE_SYSTEM_PROMPT_SCHEMA_GEN;

  // Add tech stack context
  if (techStack) {
    enhanced += `\n\n${"═".repeat(75)}
## PROJECT TECH STACK CONTEXT
${"═".repeat(75)}

The user is building with:
- **Database**: ${techStack.database}
- **ORM**: ${techStack.orm}
- **Language**: ${techStack.language}
- **Backend**: ${techStack.backendFramework}
- **Authentication**: ${techStack.authLibrary}
- **Billing**: ${techStack.billingLibrary}

IMPORTANT: Use this tech stack as CONTEXT for making intelligent decisions, NOT as rigid constraints. If the user asks for something that requires a different approach, prioritize their request.
`;
  }

  // Add recent schemas for context
  if (recentSchemas.length > 0) {
    enhanced += `\n\n${"═".repeat(75)}
## RECENT SCHEMAS IN THIS PROJECT
${"═".repeat(75)}

For context, here are recent schemas created in this project:
`;

    recentSchemas.forEach((schema, idx) => {
      enhanced += `\n${idx + 1}. **${schema.name}**`;
      if (schema.description) {
        enhanced += `\n   Description: ${schema.description}`;
      }
      if (schema.tableCount) {
        enhanced += `\n   Tables: ${schema.tableCount}`;
      }
    });

    enhanced += `\n\nUse these as reference when building upon existing work. Maintain consistency with previous schemas in this project.
`;
  }

  // Add conversation context insights
  if (conversationHistory.length > 0) {
    enhanced += `\n\n${"═".repeat(75)}
## CONVERSATION CONTEXT
${"═".repeat(75)}

You have ${conversationHistory.length} previous messages in this conversation. Review the conversation history to:
- Understand what has already been discussed
- Reference previous decisions and schemas
- Build incrementally on past work
- Maintain consistency with earlier responses

**DO NOT repeat information or ask questions that have already been answered in this conversation.**
`;
  }

  enhanced += `\n\n${"═".repeat(75)}
## CONTEXT-AWARE RESPONSE GUIDELINES
${"═".repeat(75)}

1. **Be Aware**: You have full context of this project's tech stack, patterns, and history
2. **Be Consistent**: Follow detected patterns automatically
3. **Be Smart**: Don't ask for information you already know
4. **Be Helpful**: Reference past work when relevant
5. **Be Adaptive**: If user requests something different from patterns, adapt intelligently

Remember: The user has provided rich context. Use it to give better, more personalized responses.
`;

  return enhanced;
}

export { EnhancedSchemaGenPrompt };
