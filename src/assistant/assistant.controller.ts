import { Body, Controller, Post } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Public()
  @Post('chat')
  async chat(
    @Body() body: { message: string },
  ): Promise<{ response: string }> {
    const response = await this.assistantService.chat(body.message);
    return { response };
  }
}
