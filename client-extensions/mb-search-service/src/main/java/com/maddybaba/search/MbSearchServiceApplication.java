package com.maddybaba.search;

import com.liferay.client.extension.util.spring.boot3.ClientExtensionUtilSpringBootComponentScan;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Trip search for the website and app (docs/search.md): public, read-only endpoints over an in-memory
 * catalog of approved listings, destinations and active hosts.
 */
@EnableScheduling
@Import(ClientExtensionUtilSpringBootComponentScan.class)
@SpringBootApplication
public class MbSearchServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(MbSearchServiceApplication.class, args);
	}

	@Bean
	public WebMvcConfigurer corsConfigurer(@Value("${mb.search.cors-origins}") String[] origins) {
		return new WebMvcConfigurer() {

			@Override
			public void addCorsMappings(CorsRegistry corsRegistry) {
				corsRegistry.addMapping("/search/**").allowedMethods("GET").allowedOrigins(origins);
			}

		};
	}

}
