import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { UpdateMediaDto } from './dto/update-media.dto';

interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'files', maxCount: 20 },
    ]),
  )
  upload(
    @UploadedFiles()
    uploadedFiles: {
      file?: UploadedImageFile[];
      files?: UploadedImageFile[];
    },
    @Body('site_id') siteId?: string,
    @Body('title') title?: string,
    @Body('alt') alt?: string,
    @Body('titles') titles?: string[] | string,
    @Body('alts') alts?: string[] | string,
    @Body('tags') tags?: string,
  ) {
    const files: UploadedImageFile[] = [];
    if (uploadedFiles?.files) files.push(...uploadedFiles.files);
    if (uploadedFiles?.file) files.push(...uploadedFiles.file);
    return this.mediaService.uploadImages({
      files,
      siteId: siteId || undefined,
      title,
      alt,
      titles: this.toArray(titles),
      alts: this.toArray(alts),
      tags: tags
        ? tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    });
  }

  @Get()
  list(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('search') search?: string,
    @Query('site_id') siteId?: string,
  ) {
    return this.mediaService.list({
      type: type ?? 'image',
      page: Number(page) || 1,
      search: search ?? '',
      siteId,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMediaDto) {
    return this.mediaService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.mediaService.remove(id);
  }

  private toArray(value?: string[] | string): string[] {
    if (Array.isArray(value)) return value;
    if (value === undefined) return [];
    return [value];
  }
}
