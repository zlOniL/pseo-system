import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './common/supabase.module';
import { AiModule } from './ai/ai.module';
import { ValidationModule } from './validation/validation.module';
import { ContentsModule } from './contents/contents.module';
import { GenerationModule } from './generation/generation.module';
import { WordPressModule } from './wordpress/wordpress.module';
import { CitiesModule } from './cities/cities.module';
import { ServicesModule } from './services/services.module';
import { QueueModule } from './queue/queue.module';
import { ServiceTemplatesModule } from './service-templates/service-templates.module';
import { SitesModule } from './sites/sites.module';
import { WhitelabelApiModule } from './integrations/whitelabel-api/whitelabel-api.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    CitiesModule,
    AiModule,
    ValidationModule,
    ContentsModule,
    GenerationModule,
    WordPressModule,
    ServicesModule,
    MediaModule,
    SitesModule,
    WhitelabelApiModule,
    QueueModule,
    ServiceTemplatesModule,
  ],
})
export class AppModule {}
