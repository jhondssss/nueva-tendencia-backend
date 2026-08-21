import { Body, Controller, Post, Req } from '@nestjs/common';
import { AssistantService, ChatMessage } from './assistant.service';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Roles('admin', 'operario', 'cliente')
  @Post('chat')
  async chat(
    @Body() body: { message: string; history?: ChatMessage[] },
    @Req() req: any,
  ): Promise<{ response: string }> {
    const response = await this.assistantService.chat(body.message, body.history, {
      role: req.user?.role,
      clienteId: req.user?.clienteId,
    });
    return { response };
  }
}
