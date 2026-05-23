import { forwardRef, Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { GenerationModule } from '../generation/generation.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [forwardRef(() => GenerationModule), MediaModule],
  providers: [ServicesService],
  controllers: [ServicesController],
  exports: [ServicesService],
})
export class ServicesModule {}
