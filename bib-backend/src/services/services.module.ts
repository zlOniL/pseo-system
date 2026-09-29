import { forwardRef, Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { GenerationModule } from '../generation/generation.module';
import { MediaModule } from '../media/media.module';
import { FtpHtmlModule } from '../integrations/ftp-html/ftp-html.module';

@Module({
  imports: [forwardRef(() => GenerationModule), MediaModule, FtpHtmlModule],
  providers: [ServicesService],
  controllers: [ServicesController],
  exports: [ServicesService],
})
export class ServicesModule {}
