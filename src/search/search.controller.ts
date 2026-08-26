import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Roles('admin', 'operario')
  @Get()
  buscar(@Query() query: SearchQueryDto) {
    return this.searchService.buscar(query.q);
  }
}
